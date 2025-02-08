// For Trivia Trials
// app.js

import express from "express";
import bodyParser from "body-parser";
import axios from "axios";
import cors from "cors";
import { firestore } from "./firebaseConfig.js";
import http from "http";
import https from "https";
import { v4 as uuidv4 } from "uuid";
import { generateQuestionsWithRetry } from './geminiQuestionGenerator.js';
import { TOPICS, GAME_STATES, GameSession, gameManager } from './gameConfig.js';

// Constants
const ACCESS_TOKEN = "EAAXxaUQfr3gBO5XDpAF6ZCFo1GIjruy4YgqiJMElgpaawXMCrXWBpSHGiB1aSf2hmkSzJhJLG3N14Uan8Axghepb2ftoMBcOkaKv9aOs5j8BUQZASbhrM95qFn6dPeYawQZAi2sFzdW6uJRW2HSL8CteNsAbYn3783HuuVeFAPfk7ETE1ZATvRSWZBpDS6UDyBQZDZD";
const VERSION = "v22.0";
const VERIFY_TOKEN = "icupatoken31";

// HTTP/HTTPS Agent Configuration
const httpAgent = new http.Agent({
  keepAlive: true,
  maxSockets: 50,
  maxFreeSockets: 10,
});

const httpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 50,
  maxFreeSockets: 10,
});

// Axios Configuration
axios.defaults.timeout = 60000 * 3; // 3 minutes
axios.defaults.httpAgent = httpAgent;
axios.defaults.httpsAgent = httpsAgent;

// Express App Setup
const app = express();

app.use(cors({
  origin: [
    "http://localhost:3000",
    "https://triviatrialsmessaging.onrender.com",
  ],
  methods: ["GET", "POST"],
  credentials: true,
}));

app.use(bodyParser.json());

// Logging Middleware
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`, req.body);
  next();
});

// Utility Functions
const formatPhoneNumber = (phone) => {
  let cleaned = phone.replace(/[^\d+]/g, "");
  if (!cleaned.startsWith("+")) {
    cleaned = "+" + cleaned;
  }
  return cleaned;
};

// WhatsApp API Functions
async function testWhatsAppConnection() {
  try {
    const response = await axios.get(
      `https://graph.facebook.com/${VERSION}/me`,
      {
        headers: {
          Authorization: `Bearer ${ACCESS_TOKEN}`,
        },
      }
    );
    console.log("WhatsApp connection test successful:", response.data);
    return true;
  } catch (error) {
    console.error(
      "WhatsApp connection test failed:",
      error.response?.data || error.message
    );
    return false;
  }
}

async function sendWhatsAppMessage(phone, messagePayload, phoneNumberId) {
  try {
    const url = `https://graph.facebook.com/${VERSION}/${phoneNumberId}/messages`;
    const response = await axios({
      method: "POST",
      url: url,
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      data: {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: formatPhoneNumber(phone),
        ...messagePayload,
      },
    });
    console.log(`Message sent successfully from ${phoneNumberId}:`, response.data);
    return response.data;
  } catch (error) {
    console.error(
      `WhatsApp message sending error from ${phoneNumberId}:`,
      error.response?.data || error.message
    );
    throw error;
  }
}

// Message Templates
async function sendDefaultMessage(phone, phoneNumberId) {
  await sendWhatsAppMessage(phone, {
    type: "text",
    text: {
      body: "Send 'play' to start a new game or 'help' for instructions."
    }
  }, phoneNumberId);
}

async function sendWelcomeMessage(phone, phoneNumberId) {
  // First set of topics
  await sendWhatsAppMessage(phone, {
    type: "interactive",
    interactive: {
      type: "button",
      header: {
        type: "text",
        text: "🎮 Welcome to Trivia Trials! 🎮"
      },
      body: {
        text: "Battle with peers, show your knowledge across various topics! Choose your preferred topic to begin:"
      },
      action: {
        buttons: [
          { type: "reply", reply: { id: "topic_science", title: "Science" } },
          { type: "reply", reply: { id: "topic_history", title: "History" } },
          { type: "reply", reply: { id: "topic_geography", title: "Geography" } }
        ]
      }
    }
  }, phoneNumberId);

  // Second set of topics
  await sendWhatsAppMessage(phone, {
    type: "interactive",
    interactive: {
      type: "button",
      body: {
        text: "More topics:"
      },
      action: {
        buttons: [
          { type: "reply", reply: { id: "topic_entertainment", title: "Entertainment" } },
          { type: "reply", reply: { id: "topic_sports", title: "Sports" } },
          { type: "reply", reply: { id: "topic_technology", title: "Technology" } }
        ]
      }
    }
  }, phoneNumberId);
}

async function sendHelpMessage(phone, phoneNumberId) {
  const helpText = `🎮 *How to Play Trivia Trials* 🎮

1️⃣ Type 'play' or 'start' to begin
2️⃣ Choose your preferred topic
3️⃣ Select game mode (Single Player or Multiplayer)
4️⃣ Choose number of questions (5-20)
5️⃣ Answer questions by selecting options

*Commands:*
• 'play' - Start new game
• 'help' - Show this help message
• 'quit' - Exit current game

*Game Modes:*
• Single Player - Play solo
• Multiplayer - Challenge a friend`;

  await sendWhatsAppMessage(phone, {
    type: "text",
    text: { body: helpText }
  }, phoneNumberId);
}

// Game Logic Functions
async function handleQuestionCountInput(input, phone, phoneNumberId) {
  const count = parseInt(input);
  if (isNaN(count) || count < 5 || count > 20) {
    await sendWhatsAppMessage(phone, {
      type: "text",
      text: {
        body: "Please enter a number between 5 and 20 for the number of questions."
      }
    }, phoneNumberId);
    return;
  }

  const userContext = gameManager.userContexts.get(phone);
  userContext.questionCount = count;
  userContext.state = GAME_STATES.IN_GAME;
  gameManager.userContexts.set(phone, userContext);

  await startGame(phone, phoneNumberId, userContext.topic, count);
}

async function startGame(phone, phoneNumberId, topic, questionCount) {
  try {
    const questions = await generateQuestionsWithRetry(topic, questionCount);
    const gameSession = gameManager.getSession(phone) || gameManager.createSession(phone);
    gameSession.questions = questions;
    gameSession.currentQuestionIndex = 0;
    gameSession.score = 0;
    
    await sendQuestion(phone, phoneNumberId, questions[0], 1, questionCount);
  } catch (error) {
    console.error('Error starting game:', error);
    await sendWhatsAppMessage(phone, {
      type: "text",
      text: {
        body: "Sorry, we encountered an error starting the game. Please try again."
      }
    }, phoneNumberId);
  }
}

async function sendQuestion(phone, phoneNumberId, questionData, currentNumber, totalQuestions) {
  const optionLetters = ['A', 'B', 'C', 'D'];
  
  const questionText = `Question ${currentNumber}/${totalQuestions}:\n\n${questionData.question}\n\n` +
    questionData.options.map((option, index) => 
      `${optionLetters[index]}) ${option}`
    ).join('\n');

  await sendWhatsAppMessage(phone, {
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: questionText },
      action: {
        buttons: optionLetters.slice(0, questionData.options.length).map(letter => ({
          type: "reply",
          reply: { id: `answer_${letter.toLowerCase()}`, title: letter }
        }))
      }
    }
  }, phoneNumberId);
}

async function handleGameAnswer(answer, phone, phoneNumberId) {
  const userContext = gameManager.userContexts.get(phone);
  if (!userContext || userContext.state !== GAME_STATES.IN_GAME) {
    await sendDefaultMessage(phone, phoneNumberId);
    return;
  }

  // TODO: Implement answer validation and scoring
  await sendWhatsAppMessage(phone, {
    type: "text",
    text: {
      body: "Answer received! Next question coming up..."
    }
  }, phoneNumberId);
}

// Game Mode Handlers
async function handleTopicSelection(topic, phone, phoneNumberId) {
  await sendWhatsAppMessage(phone, {
    type: "interactive",
    interactive: {
      type: "button",
      body: {
        text: "Choose game mode:"
      },
      action: {
        buttons: [
          { type: "reply", reply: { id: "single_player", title: "Single Player" } },
          { type: "reply", reply: { id: "multiplayer", title: "Multiplayer" } }
        ]
      }
    }
  }, phoneNumberId);

  const userContext = gameManager.userContexts.get(phone);
  userContext.topic = topic;
  userContext.state = GAME_STATES.QUESTION_COUNT;
  gameManager.userContexts.set(phone, userContext);
}

async function startSinglePlayerGame(phone, phoneNumberId) {
  await sendWhatsAppMessage(phone, {
    type: "text",
    text: {
      body: "How many questions would you like? (Enter a number between 5-20)"
    }
  }, phoneNumberId);
}

async function startMultiplayerGame(phone, phoneNumberId) {
  const gameId = gameManager.createSession(phone);
  
  await firestore.collection('games').doc(gameId).set({
    hostPlayer: phone,
    status: 'waiting',
    topic: gameManager.userContexts.get(phone).topic,
    createdAt: new Date()
  });

  const gameLink = `https://yourserver.com/join/${gameId}`;
  
  await sendWhatsAppMessage(phone, {
    type: "text",
    text: {
      body: `Share this link with your opponent to start the game: ${gameLink}`
    }
  }, phoneNumberId);
}

// Message Handlers
async function handleTextMessages(message, phone, phoneNumberId) {
  const userContext = gameManager.userContexts.get(phone) || {
    state: GAME_STATES.IDLE
  };

  if (message.text.body.toLowerCase() === 'play trivia') {
    await sendWelcomeMessage(phone, phoneNumberId);
    return;
  }

  if (message.text.body.toLowerCase() === 'help') {
    await sendHelpMessage(phone, phoneNumberId);
    return;
  }

  switch (userContext.state) {
    case GAME_STATES.QUESTION_COUNT:
      await handleQuestionCountInput(message.text.body, phone, phoneNumberId);
      break;
    case GAME_STATES.IN_GAME:
      await handleGameAnswer(message.text.body, phone, phoneNumberId);
      break;
    default:
      await sendDefaultMessage(phone, phoneNumberId);
  }
}

async function handleInteractiveMessage(message, phone, phoneNumberId) {
  const buttonId = message.interactive.button_reply.id;
  
  if (buttonId.startsWith('topic_')) {
    const topic = buttonId.replace('topic_', '');
    await handleTopicSelection(topic, phone, phoneNumberId);
  } else if (buttonId === 'single_player') {
    await startSinglePlayerGame(phone, phoneNumberId);
  } else if (buttonId === 'multiplayer') {
    await startMultiplayerGame(phone, phoneNumberId);
  }
}

// Routes
app.post("/webhook", async (req, res) => {
  if (req.body.object === "whatsapp_business_account") {
    const changes = req.body.entry?.[0]?.changes?.[0];
    const messages = changes.value?.messages;
    const phoneNumberId = changes.value?.metadata?.phone_number_id;

    if (!changes || !messages || !phoneNumberId) {
      return res.status(400).send("Invalid payload.");
    }

    const message = messages[0];
    const phone = message.from;

    try {
      switch (message.type) {
        case "text":
          await handleTextMessages(message, phone, phoneNumberId);
          break;
        case "interactive":
          await handleInteractiveMessage(message, phone, phoneNumberId);
          break;
      }
    } catch (err) {
      console.error("Error processing message:", err);
    }
  }
  res.sendStatus(200);
});

app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode && token) {
    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      console.log("Webhook verified successfully!");
      res.status(200).send(challenge);
    } else {
      res.status(403).send("Verification failed!");
    }
  }
});

// Server Startup
const port = process.env.PORT || 5000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
  testWhatsAppConnection();
});
