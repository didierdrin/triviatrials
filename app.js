// app.js

import express from "express";
import bodyParser from "body-parser";
import axios from "axios";
import cors from "cors";
import http from "http";
import https from "https";
import { v4 as uuidv4 } from "uuid";
import { firestore } from "./firebaseConfig.js";
import { generateQuestionsWithRetry } from './geminiQuestionGenerator.js';
import { TOPICS, GAME_STATES, GameSession, gameManager } from './gameConfig.js';

// Custom HTTP and HTTPS Agents for robust connections
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
axios.defaults.timeout = 60000 * 3; // 3 minutes
axios.defaults.httpAgent = httpAgent;
axios.defaults.httpsAgent = httpsAgent;

const app = express();
app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "https://triviatrialsmessaging.onrender.com",
    ],
    methods: ["GET", "POST"],
    credentials: true,
  })
);
app.use(bodyParser.json());

// WhatsApp API credentials and version
const ACCESS_TOKEN =
  "EAAQYaGPHZBD0BOy9b3acDU6ywehiKJarISySO1XUSITOQwNgUeFqnBjuKtjPfPLJNxdsGlN08DCehUwpZCvQZCjQp9G63XeKWiZC86iYemL5E8Rb9hozG46ZBgQZBGHtSBZBUGXmvkZCZA5TZBPlCfheoeYYz5VvpDfyHbEjqvtAA9MXzi43n1lQB9lrF2ymUPCHyfHAZDZD";
const VERSION = "v22.0";

// Global in-memory store for user contexts is managed by gameManager.userContexts

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`, req.body);
  next();
});


// --- NEW: In-Memory Cache for User Tracking ---
const userCache = {
  users: new Set(), // Stores phone numbers of known users
  totalCount: 0,    // Total unique users (syncs with Firebase periodically)
};

// Initialize cache from Firebase on startup
async function initializeUserCache() {
  try {
    const snapshot = await firestore.collection("users_globalt").get();
    snapshot.forEach(doc => {
      userCache.users.add(doc.id);
    });
    userCache.totalCount = snapshot.size;
    console.log(`User cache initialized with ${userCache.totalCount} users.`);
  } catch (error) {
    console.error("Error initializing user cache:", error);
  }
}
initializeUserCache();

// --- NEW: Track Users with Cache + Firebase ---
async function trackUser(phone) {
  const formattedPhone = formatPhoneNumber(phone);
  
  // Check cache first (fast)
  if (userCache.users.has(formattedPhone)) {
    return false; // Existing user
  }

  // Not in cache - check Firebase (slow)
  try {
    const userRef = doc(firestore, "users_globalt", formattedPhone);
    const userSnapshot = await getDoc(userRef);
    
    if (!userSnapshot.exists()) {
      // New user - save to Firebase and cache
      await setDoc(userRef, {
        phone: formattedPhone,
        firstInteraction: new Date().toISOString(),
        lastInteraction: new Date().toISOString(),
        messageCount: 1
      });
      userCache.users.add(formattedPhone);
      userCache.totalCount++;
      console.log(`New user tracked: ${formattedPhone}`);
      return true;
    } else {
      // Existing user - update last interaction
      await setDoc(userRef, {
        lastInteraction: new Date().toISOString(),
        messageCount: increment(1)
      }, { merge: true });
      userCache.users.add(formattedPhone); // Add to cache
      return false;
    }
  } catch (error) {
    console.error("Error tracking user:", error);
    return false;
  }
}

// --- NEW: API Endpoint to Get User Stats ---
app.get("/user-stats", (req, res) => {
  res.json({
    totalUsers: userCache.totalCount,
    cachedUsers: userCache.users.size,
  });
});
// ------------------------------
// Message Sending Functions
// ------------------------------
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

async function sendDefaultMessage(phone, phoneNumberId) {
  await sendWhatsAppMessage(phone, {
    type: "text",
    text: {
      body: `*Start*\nSend 'Play' to start a new game or 'help' for instructions.`
    }
  }, phoneNumberId);
}

async function sendWelcomeMessage(phone, phoneNumberId) {
  // Update user context with a new stage
  const userContext = gameManager.userContexts.get(phone) || {};
  userContext.stage = "EXPECTING_WELCOME"; // Mark stage as welcome
  gameManager.userContexts.set(phone, userContext);

  const payload = {
    type: "interactive",
    interactive: {
      type: "list",
      header: {
        type: "text",
        text: "🎮 Welcome to Trivia trials! 🎮"
      },
      body: {
        text: "Test your knowledge! Get started:"
      },
      footer: {
        text: "Select a topic"
      },
      action: {
        button: "View Topics",
        sections: [
          {
            title: "Trivia Topics",
            rows: [
              {
                id: "topic_science",
                title: "Science",
                description: "Explore scientific wonders"
              },
              {
                id: "topic_history",
                title: "History",
                description: "Dive into the past"
              },
              {
                id: "topic_geography",
                title: "Geography",
                description: "Discover world facts"
              },
              {
                id: "topic_entertainment",
                title: "Entertainment",
                description: "Test pop culture knowledge"
              },
              {
                id: "topic_sports",
                title: "Sports",
                description: "Score with sports trivia"
              },
              {
                id: "topic_technology",
                title: "Technology",
                description: "Innovate with tech trivia"
              }
            ]
          }
        ]
      }
    }
  };

  await sendWhatsAppMessage(phone, payload, phoneNumberId);
}


async function sendHelpMessage(phone, phoneNumberId) {
  const helpText = `🎮 *How to Play Trivia Trials* 🎮

1️⃣ Type 'play' to begin a game.
2️⃣ Choose your preferred topic.
3️⃣ Select game mode (Single Player or Multiplayer(Coming soon)).
4️⃣ Choose number of questions (5-20).
5️⃣ Answer questions by selecting options.

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

function formatPhoneNumber(phone) {
  let cleaned = phone.replace(/[^\d+]/g, "");
  if (!cleaned.startsWith("+")) {
    cleaned = "+" + cleaned;
  }
  return cleaned;
}

// ------------------------------
// Game Functions
// ------------------------------

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

function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

async function startGame(phone, phoneNumberId, topic, questionCount) {
  try {
    // Generate questions using Gemini
    const questions = await generateQuestionsWithRetry(topic, questionCount);
    const userContext = gameManager.userContexts.get(phone);

    // Shuffle the questions so they appear in a random order each game
    const shuffledQuestions = shuffleArray(questions);
    
    userContext.questions = shuffledQuestions;
    userContext.currentQuestionIndex = 0;
    userContext.score = 0;
    // For single-player, no gameId is set
    gameManager.userContexts.set(phone, userContext);
    
    // Send the first question from the shuffled set
    await sendQuestion(phone, phoneNumberId, shuffledQuestions[0], 1, shuffledQuestions.length);
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
  const optionLetters = ['A', 'B', 'C'];
  const questionText = `*Question* ${currentNumber}/${totalQuestions}:\n\n${questionData.question}\n\n` +
    questionData.options.map((option, index) => `${optionLetters[index]}) ${option}`).join('\n');

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

  // Check if multiplayer (gameId exists in userContext)
  if (userContext.gameId) {
    // Multiplayer mode
    const session = gameManager.getSession(userContext.gameId);
    if (!session) {
      await sendWhatsAppMessage(phone, {
        type: "text",
        text: { body: "Game session not found." }
      }, phoneNumberId);
      return;
    }
    if (session.currentTurn && session.currentTurn !== phone) {
      await sendWhatsAppMessage(phone, {
        type: "text",
        text: { body: "It's not your turn yet." }
      }, phoneNumberId);
      return;
    }
    const currentQuestion = session.questions[session.currentQuestionIndex];
    const mapping = { a: 0, b: 1, c: 2 };
    const answerLetter = answer.trim().toLowerCase();
    if (!(answerLetter in mapping)) {
      await sendWhatsAppMessage(phone, {
        type: "text",
        text: { body: "Please select a valid answer option (A, B, or C)." }
      }, phoneNumberId);
      return;
    }
    const selectedIndex = mapping[answerLetter];
    const isCorrect = selectedIndex === currentQuestion.correctAnswerIndex;
    let pointsAwarded = 0;
    if (isCorrect) {
      if (currentQuestion.difficulty === "easy") pointsAwarded = 10;
      else if (currentQuestion.difficulty === "medium") pointsAwarded = 20;
      else pointsAwarded = 30;
      session.scores[phone] = (session.scores[phone] || 0) + pointsAwarded;
    }
    let feedbackMessage = isCorrect
      ? `Correct!\nYou've earned ${pointsAwarded} points.`
      : `Incorrect!\nThe correct answer was ${String.fromCharCode(65 + currentQuestion.correctAnswerIndex)}. ${currentQuestion.explanation}`;
    await sendWhatsAppMessage(phone, {
      type: "text",
      text: { body: feedbackMessage }
    }, phoneNumberId);

    // For turn-based multiplayer, alternate turns
    if (session.hostPlayer === phone) {
      session.currentTurn = session.guestPlayer;
    } else {
      session.currentTurn = session.hostPlayer;
      // Once both have answered, advance the question index
      session.currentQuestionIndex++;
    }
    if (session.currentQuestionIndex >= session.questions.length) {
      session.status = "completed";
      const finalMessage = `Game Over!\nFinal Scores:\nHost: ${session.scores[session.hostPlayer]}\nGuest: ${session.scores[session.guestPlayer]}\nType 'play' to start a new game.`;
      await sendWhatsAppMessage(session.hostPlayer, { type: "text", text: { body: finalMessage } }, phoneNumberId);
      await sendWhatsAppMessage(session.guestPlayer, { type: "text", text: { body: finalMessage } }, phoneNumberId);
      let hostContext = gameManager.userContexts.get(session.hostPlayer);
      let guestContext = gameManager.userContexts.get(session.guestPlayer);
      if (hostContext) { hostContext.state = GAME_STATES.GAME_OVER; delete hostContext.gameId; }
      if (guestContext) { guestContext.state = GAME_STATES.GAME_OVER; delete guestContext.gameId; }
      gameManager.userContexts.set(session.hostPlayer, hostContext);
      gameManager.userContexts.set(session.guestPlayer, guestContext);
      return;
    }
    // Notify players: if it’s the current player’s turn, send the next question; otherwise, show a waiting message.
    if (session.currentTurn === phone) {
      await sendQuestion(phone, phoneNumberId, session.questions[session.currentQuestionIndex], session.currentQuestionIndex + 1, session.questions.length);
    } else {
      await sendWhatsAppMessage(phone, {
        type: "text",
        text: { body: "Waiting for your opponent to answer..." }
      }, phoneNumberId);
    }
    gameManager.sessions.set(userContext.gameId, session);
  } else {
    // Single Player mode
    const currentQuestion = userContext.questions[userContext.currentQuestionIndex];
    const mapping = { a: 0, b: 1, c: 2 };
    const answerLetter = answer.trim().toLowerCase();
    if (!(answerLetter in mapping)) {
      await sendWhatsAppMessage(phone, {
        type: "text",
        text: { body: "Please select a valid answer option (A, B, or C)." }
      }, phoneNumberId);
      return;
    }
    const selectedIndex = mapping[answerLetter];
    const isCorrect = selectedIndex === currentQuestion.correctAnswerIndex;
    let pointsAwarded = 0;
    if (isCorrect) {
      if (currentQuestion.difficulty === "easy") pointsAwarded = 10;
      else if (currentQuestion.difficulty === "medium") pointsAwarded = 20;
      else pointsAwarded = 30;
      userContext.score += pointsAwarded;
    }
    let feedbackMessage = isCorrect
      ? `Correct!\nYou've earned ${pointsAwarded} points.`
      : `Incorrect!\nThe correct answer was ${String.fromCharCode(65 + currentQuestion.correctAnswerIndex)}. ${currentQuestion.explanation}`;
    await sendWhatsAppMessage(phone, {
      type: "text",
      text: { body: feedbackMessage }
    }, phoneNumberId);

    userContext.currentQuestionIndex++;
    if (userContext.currentQuestionIndex < userContext.questions.length) {
      setTimeout(async () => {
        await sendQuestion(phone, phoneNumberId, userContext.questions[userContext.currentQuestionIndex], userContext.currentQuestionIndex + 1, userContext.questions.length);
      }, 1000);
    } else {
      userContext.state = GAME_STATES.GAME_OVER;

      // Calculate the total possible score for the round
  const totalPossible = userContext.questions.reduce((total, question) => {
    if (question.difficulty === "easy") return total + 10;
    if (question.difficulty === "medium") return total + 20;
    if (question.difficulty === "hard") return total + 30;
    return total;
  }, 0);
      
      let finalMessage = `Game Over! Your final score is ${userContext.score}/${totalPossible}\n`;
      if (userContext.score >= userContext.questions.length * 20) {
        finalMessage += "🏆 Achievement Unlocked: Trivia Master!\n";
      }
      finalMessage += "Type 'play' to start a new game.";
      await sendWhatsAppMessage(phone, {
        type: "text",
        text: { body: finalMessage }
      }, phoneNumberId);
    }
    gameManager.userContexts.set(phone, userContext);
  }
}

// ------------------------------
// Handling Incoming WhatsApp Messages
// ------------------------------
async function handleTextMessages(message, phone, phoneNumberId) {
  // Check for join command for multiplayer
  if (message.text.body.toLowerCase().startsWith("join ")) {
    const parts = message.text.body.split(" ");
    if (parts.length >= 2) {
      const gameId = parts[1];
      const session = gameManager.getSession(gameId);
      if (!session) {
        await sendWhatsAppMessage(phone, {
          type: "text",
          text: { body: "Game session not found. Please check the link and try again." }
        }, phoneNumberId);
        return;
      }
      if (session.guestPlayer) {
        await sendWhatsAppMessage(phone, {
          type: "text",
          text: { body: "This game session already has a guest player." }
        }, phoneNumberId);
        return;
      }
      session.guestPlayer = phone;
      session.scores[phone] = 0;
      // Store gameId in guest context
      const guestContext = {
        state: GAME_STATES.IN_GAME,
        score: 0,
        questions: session.questions,
        currentQuestionIndex: 0,
        topic: session.topic,
        gameId: session.gameId
      };
      gameManager.userContexts.set(phone, guestContext);
      // For host, ensure gameId is stored
      const hostContext = gameManager.userContexts.get(session.hostPlayer);
      if (hostContext) {
        hostContext.gameId = session.gameId;
        gameManager.userContexts.set(session.hostPlayer, hostContext);
      }
      // Set initial turn (host starts)
      session.currentTurn = session.hostPlayer;
      await sendWhatsAppMessage(phone, {
        type: "text",
        text: { body: "You've joined the game! Wait for your turn." }
      }, phoneNumberId);
      await sendWhatsAppMessage(session.hostPlayer, {
        type: "text",
        text: { body: "Your opponent has joined! It's your turn." }
      }, phoneNumberId);
      gameManager.sessions.set(session.gameId, session);
      // Send first question to host if not already sent
      await sendQuestion(session.hostPlayer, phoneNumberId, session.questions[0], 1, session.questions.length);
      return;
    }
  }

  // Retrieve user context (default to IDLE)
  const userContext = gameManager.userContexts.get(phone) || { state: GAME_STATES.IDLE };

  if (message.text.body.toLowerCase() === 'play') {
    userContext.state = GAME_STATES.TOPIC_SELECTION;
    gameManager.userContexts.set(phone, userContext);
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
  const interactive = message.interactive;
  // Check if the reply came from a list or button
  const replyId = interactive.list_reply
    ? interactive.list_reply.id
    : interactive.button_reply
      ? interactive.button_reply.id
      : null;
  
  if (!replyId) {
    console.error("No valid interactive reply found.");
    return;
  }
  
  if (replyId.startsWith('topic_')) {
    const topic = replyId.replace('topic_', '');
    await handleTopicSelection(topic, phone, phoneNumberId);
  } else if (replyId === 'single_player') {
    await startSinglePlayerGame(phone, phoneNumberId);
  } else if (replyId === 'multiplayer') {
    await startMultiplayerGame(phone, phoneNumberId);
  } else if (replyId.startsWith('answer_')) {
    const answer = replyId.replace('answer_', '');
    await handleGameAnswer(answer, phone, phoneNumberId);
  }
}


async function handleTopicSelection(topic, phone, phoneNumberId) {
  await sendWhatsAppMessage(phone, {
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: `*Game mode*\nChoose an option\n(Multiplayer coming soon)` },
      action: {
        buttons: [
          { type: "reply", reply: { id: "single_player", title: "Single Player" } }
          // { type: "reply", reply: { id: "multiplayer", title: "Multiplayer" } }
        ]
      }
    }
  }, phoneNumberId);
  const userContext = gameManager.userContexts.get(phone) || {};
  userContext.topic = topic;
  userContext.state = GAME_STATES.QUESTION_COUNT;
  gameManager.userContexts.set(phone, userContext);
}

async function startSinglePlayerGame(phone, phoneNumberId) {
  await sendWhatsAppMessage(phone, {
    type: "text",
    text: { body: "How many questions would you like? (Enter a number between 5-20)" }
  }, phoneNumberId);
}

async function startMultiplayerGame(phone, phoneNumberId) {
  const gameId = gameManager.createSession(phone);
  // Save session data in Firebase for persistence
  await firestore.collection('games').doc(gameId).set({
    hostPlayer: phone,
    status: 'waiting',
    topic: gameManager.userContexts.get(phone).topic,
    createdAt: new Date()
  });
  // Generate questions immediately for both players
  const topic = gameManager.userContexts.get(phone).topic;
  const questionCount = 5; // Default count for multiplayer; you can change this or prompt the host
  const questions = await generateQuestionsWithRetry(topic, questionCount);
  const session = gameManager.getSession(gameId);
  session.questions = questions;
  session.currentQuestionIndex = 0;
  session.scores[phone] = 0;
  // Save gameId in host context
  const hostContext = gameManager.userContexts.get(phone) || {};
  hostContext.state = GAME_STATES.IN_GAME;
  hostContext.score = 0;
  hostContext.questions = questions;
  hostContext.currentQuestionIndex = 0;
  hostContext.topic = topic;
  hostContext.gameId = gameId;
  gameManager.userContexts.set(phone, hostContext);

  const gameLink = `https://triviatrialsmessaging.onrender.com/join/${gameId}`;
  await sendWhatsAppMessage(phone, {
    type: "text",
    text: { body: `Share this link with your opponent to join the game: ${gameLink}` }
  }, phoneNumberId);
}

// ------------------------------
// Webhook Routes
// ------------------------------
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

    // Track user
    await trackUser(phone); 
    
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

// Endpoint for WhatsApp webhook verification
app.get("/webhook", (req, res) => {
  const VERIFY_TOKEN = "icupatoken31";
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

// Route for opponents joining the multiplayer game via link
app.get("/join/:gameId", async (req, res) => {
  const gameId = req.params.gameId;
  const session = gameManager.getSession(gameId);
  if (!session) {
    res.status(404).send("Game session not found.");
    return;
  }
  res.send(`
    <h1>Join Game: ${gameId}</h1>
    <p>To join this game, send the following message from your WhatsApp:</p>
    <code>join ${gameId}</code>
  `);
});

// Test WhatsApp connection
async function testWhatsAppConnection() {
  try {
    const response = await axios.get(
      `https://graph.facebook.com/${VERSION}/me`,
      { headers: { Authorization: `Bearer ${ACCESS_TOKEN}` } }
    );
    console.log("WhatsApp connection test successful:", response.data);
    return true;
  } catch (error) {
    console.error("WhatsApp connection test failed:", error.response?.data || error.message);
    return false;
  }
}

const port = process.env.PORT || 5000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
  testWhatsAppConnection();
});
