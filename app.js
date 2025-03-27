// WhatsApp apps mixed -> Global Trivia & Nkundino
/**
 * Combined WhatsApp App Code: Global Trivia & Giomessaging
 *
 * This file merges both apps into one Express server.
 * ------------------------------------------------------
 * SHARED SETUP (Imports, axios, Express, etc.)
 * ------------------------------------------------------
 */

import admin from "firebase-admin";
import express from "express";
import bodyParser from "body-parser";
import axios from "axios";
import cors from "cors";
import http from "http";
import https from "https";
import { v4 as uuidv4 } from "uuid";
import { firestore } from "./firebaseConfig.js";

// For Global Trivia – import game configuration and manager
import { TOPICS, GAME_STATES, GameSession, gameManager } from "./gameConfig.js";

// Shared HTTP and HTTPS Agents for robust connections
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

// Create Express app and middleware
const app = express();
app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "https://triviatrialsmessaging.onrender.com",
      "https://giomessaging.onrender.com",
    ],
    methods: ["GET", "POST"],
    credentials: true,
  })
);
app.use(bodyParser.json());

// Shared WhatsApp API credentials and version
const ACCESS_TOKEN =
  "EAAQYaGPHZBD0BOy9b3acDU6ywehiKJarISySO1XUSITOQwNgUeFqnBjuKtjPfPLJNxdsGlN08DCehUwpZCvQZCjQp9G63XeKWiZC86iYemL5E8Rb9hozG46ZBgQZBGHtSBZBUGXmvkZCZA5TZBPlCfheoeYYz5VvpDfyHbEjqvtAA9MXzi43n1lQB9lrF2ymUPCHyfHAZDZD";
const VERSION = "v22.0";

// Shared utility: format phone numbers
function formatPhoneNumber(phone) {
  let cleaned = phone.replace(/[^\d+]/g, "");
  if (!cleaned.startsWith("+")) {
    cleaned = "+" + cleaned;
  }
  return cleaned;
}

// Shared function to send WhatsApp messages (used by both apps)
async function sendWhatsAppMessage(phone, messagePayload, phoneNumberId) {
  try {
    const url = `https://graph.facebook.com/${VERSION}/${phoneNumberId}/messages`;
    const response = await axios({
      method: "POST",
      url,
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
    console.log(
      `Message sent successfully from ${phoneNumberId}:`,
      response.data
    );
    return response.data;
  } catch (error) {
    console.error(
      `WhatsApp message sending error from ${phoneNumberId}:`,
      error.response?.data || error.message
    );
    throw error;
  }
}

/**
 * ------------------------------------------------------
 * GLOBAL TRIVIA APP SECTION
 * ------------------------------------------------------
 */

// --- Request Logging Middleware (Global Trivia) ---
app.use((req, res, next) => {
  console.log(`Request: ${req.method} ${req.path}`, req.body);
  next();
});

// --- In-Memory Cache for Trivia Users ---
const userCache = {
  users: new Set(), // Stores phone numbers of known trivia users
  totalCount: 0, // Total unique users (syncs with Firebase periodically)
};

// Initialize Trivia user cache from Firebase
async function initializeUserCache() {
  try {
    const snapshot = await firestore.collection("users_globalt").get();
    snapshot.forEach((doc) => {
      userCache.users.add(doc.id);
    });
    userCache.totalCount = snapshot.size;
    console.log(
      `Trivia user cache initialized with ${userCache.totalCount} users.`
    );
  } catch (error) {
    console.error("Error initializing trivia user cache:", error);
  }
}
initializeUserCache();

// --- Track Trivia User ---
async function trackUser(phone) {
  const formattedPhone = formatPhoneNumber(phone);

  // Check cache first (fast)
  if (userCache.users.has(formattedPhone)) {
    return false; // Existing user
  }

  // Not in cache - check Firebase (slow)
  try {
    const userRef = firestore.collection("users_globalt").doc(formattedPhone);
    const userSnapshot = await userRef.get();

    if (!userSnapshot.exists) {
      // New user - save to Firebase and cache
      await userRef.set({
        phone: formattedPhone,
        firstInteraction: new Date().toISOString(),
        lastInteraction: new Date().toISOString(),
        messageCount: 1,
      });
      userCache.users.add(formattedPhone);
      userCache.totalCount++;
      console.log(`New trivia user tracked: ${formattedPhone}`);
      return true;
    } else {
      // Existing user - update last interaction
      await userRef.update({
        lastInteraction: new Date().toISOString(),
        messageCount: admin.firestore.FieldValue.increment(1),
      });
      userCache.users.add(formattedPhone); // Add to cache
      return false;
    }
  } catch (error) {
    console.error("Error tracking trivia user:", error);
    return false;
  }
}

// --- Trivia Message Sending Functions ---
async function sendDefaultMessageTrivia(phone, phoneNumberId) {
  await sendWhatsAppMessage(
    phone,
    {
      type: "text",
      text: {
        body: `*Start*\nSend 'Play' to start a new game or 'help' for instructions.`,
      },
    },
    phoneNumberId
  );
}

async function sendWelcomeMessageTrivia(phone, phoneNumberId) {
  // Update trivia user context with a new stage
  const userContext = gameManager.userContexts.get(phone) || {};
  userContext.stage = "EXPECTING_WELCOME"; // Mark stage as welcome
  gameManager.userContexts.set(phone, userContext);

  const payload = {
    type: "interactive",
    interactive: {
      type: "list",
      header: {
        type: "text",
        text: "🎮 Welcome to Trivia trials!",
      },
      body: {
        text: "Test your knowledge!",
      },
      footer: {
        text: "Select a topic",
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
                description: "Explore scientific wonders",
              },
              {
                id: "topic_history",
                title: "History",
                description: "Dive into the past",
              },
              {
                id: "topic_geography",
                title: "Geography",
                description: "Discover world facts",
              },
              {
                id: "topic_entertainment",
                title: "Entertainment",
                description: "Test pop culture knowledge",
              },
              {
                id: "topic_sports",
                title: "Sports",
                description: "Score with sports trivia",
              },
              {
                id: "topic_technology",
                title: "Technology",
                description: "Innovate with tech trivia",
              },
            ],
          },
        ],
      },
    },
  };

  await sendWhatsAppMessage(phone, payload, phoneNumberId);
}

async function sendHelpMessageTrivia(phone, phoneNumberId) {
  const helpText = `🎮 *How to Play*

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

  await sendWhatsAppMessage(
    phone,
    {
      type: "text",
      text: { body: helpText },
    },
    phoneNumberId
  );
}

// --- Trivia Game Functions ---
async function handleQuestionCountInputTrivia(input, phone, phoneNumberId) {
  const count = parseInt(input);
  if (isNaN(count) || count < 5 || count > 20) {
    await sendWhatsAppMessage(
      phone,
      {
        type: "text",
        text: {
          body: "Please enter a number between 5 and 20 for the number of questions.",
        },
      },
      phoneNumberId
    );
    return;
  }
  const userContext = gameManager.userContexts.get(phone);
  userContext.questionCount = count;
  userContext.state = GAME_STATES.IN_GAME;
  gameManager.userContexts.set(phone, userContext);
  await startGameTrivia(phone, phoneNumberId, userContext.topic, count);
}

function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

async function startGameTrivia(phone, phoneNumberId, topic, questionCount) {
  try {
    // Generate questions using Gemini (assumes generateQuestionsWithRetry is defined)
    const questions = await generateQuestionsWithRetry(topic, questionCount);
    const userContext = gameManager.userContexts.get(phone);

    // Shuffle questions for randomness
    const shuffledQuestions = shuffleArray(questions);

    userContext.questions = shuffledQuestions;
    userContext.currentQuestionIndex = 0;
    userContext.score = 0;
    gameManager.userContexts.set(phone, userContext);

    // Send the first question
    await sendQuestionTrivia(
      phone,
      phoneNumberId,
      shuffledQuestions[0],
      1,
      shuffledQuestions.length
    );
  } catch (error) {
    console.error("Error starting trivia game:", error);
    await sendWhatsAppMessage(
      phone,
      {
        type: "text",
        text: {
          body: "Sorry, we encountered an error starting the game. Please try again.",
        },
      },
      phoneNumberId
    );
  }
}

async function sendQuestionTrivia(
  phone,
  phoneNumberId,
  questionData,
  currentNumber,
  totalQuestions
) {
  const optionLetters = ["A", "B", "C"];
  const questionText =
    `*Question* ${currentNumber}/${totalQuestions}:\n\n${questionData.question}\n\n` +
    questionData.options
      .map((option, index) => `${optionLetters[index]}) ${option}`)
      .join("\n");

  await sendWhatsAppMessage(
    phone,
    {
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: questionText },
        action: {
          buttons: optionLetters
            .slice(0, questionData.options.length)
            .map((letter) => ({
              type: "reply",
              reply: { id: `answer_${letter.toLowerCase()}`, title: letter },
            })),
        },
      },
    },
    phoneNumberId
  );
}

async function handleGameAnswerTrivia(answer, phone, phoneNumberId) {
  const userContext = gameManager.userContexts.get(phone);
  if (!userContext || userContext.state !== GAME_STATES.IN_GAME) {
    await sendDefaultMessageTrivia(phone, phoneNumberId);
    return;
  }

  // Check if multiplayer mode (gameId exists)
  if (userContext.gameId) {
    // Multiplayer mode logic (as in original code) …
    const session = gameManager.getSession(userContext.gameId);
    if (!session) {
      await sendWhatsAppMessage(
        phone,
        {
          type: "text",
          text: { body: "Game session not found." },
        },
        phoneNumberId
      );
      return;
    }
    if (session.currentTurn && session.currentTurn !== phone) {
      await sendWhatsAppMessage(
        phone,
        {
          type: "text",
          text: { body: "It's not your turn yet." },
        },
        phoneNumberId
      );
      return;
    }
    const currentQuestion = session.questions[session.currentQuestionIndex];
    const mapping = { a: 0, b: 1, c: 2 };
    const answerLetter = answer.trim().toLowerCase();
    if (!(answerLetter in mapping)) {
      await sendWhatsAppMessage(
        phone,
        {
          type: "text",
          text: { body: "Please select a valid answer option (A, B, or C)." },
        },
        phoneNumberId
      );
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
      : `Incorrect!\nThe correct answer was ${String.fromCharCode(
          65 + currentQuestion.correctAnswerIndex
        )}. ${currentQuestion.explanation}`;
    await sendWhatsAppMessage(
      phone,
      {
        type: "text",
        text: { body: feedbackMessage },
      },
      phoneNumberId
    );

    // Alternate turns and update session as in original code…
    if (session.hostPlayer === phone) {
      session.currentTurn = session.guestPlayer;
    } else {
      session.currentTurn = session.hostPlayer;
      session.currentQuestionIndex++;
    }
    if (session.currentQuestionIndex >= session.questions.length) {
      session.status = "completed";
      const finalMessage = `Game Over!\nFinal Scores:\nHost: ${
        session.scores[session.hostPlayer]
      }\nGuest: ${
        session.scores[session.guestPlayer]
      }\nType 'play' to start a new game.`;
      await sendWhatsAppMessage(
        session.hostPlayer,
        { type: "text", text: { body: finalMessage } },
        phoneNumberId
      );
      await sendWhatsAppMessage(
        session.guestPlayer,
        { type: "text", text: { body: finalMessage } },
        phoneNumberId
      );
      let hostContext = gameManager.userContexts.get(session.hostPlayer);
      let guestContext = gameManager.userContexts.get(session.guestPlayer);
      if (hostContext) {
        hostContext.state = GAME_STATES.GAME_OVER;
        delete hostContext.gameId;
      }
      if (guestContext) {
        guestContext.state = GAME_STATES.GAME_OVER;
        delete guestContext.gameId;
      }
      gameManager.userContexts.set(session.hostPlayer, hostContext);
      gameManager.userContexts.set(session.guestPlayer, guestContext);
      return;
    }
    if (session.currentTurn === phone) {
      await sendQuestionTrivia(
        phone,
        phoneNumberId,
        session.questions[session.currentQuestionIndex],
        session.currentQuestionIndex + 1,
        session.questions.length
      );
    } else {
      await sendWhatsAppMessage(
        phone,
        {
          type: "text",
          text: { body: "Waiting for your opponent to answer..." },
        },
        phoneNumberId
      );
    }
    gameManager.sessions.set(userContext.gameId, session);
  } else {
    // Single Player mode
    const currentQuestion =
      userContext.questions[userContext.currentQuestionIndex];
    const mapping = { a: 0, b: 1, c: 2 };
    const answerLetter = answer.trim().toLowerCase();
    if (!(answerLetter in mapping)) {
      await sendWhatsAppMessage(
        phone,
        {
          type: "text",
          text: { body: "Please select a valid answer option (A, B, or C)." },
        },
        phoneNumberId
      );
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
      : `Incorrect!\nThe correct answer was ${String.fromCharCode(
          65 + currentQuestion.correctAnswerIndex
        )}. ${currentQuestion.explanation}`;
    await sendWhatsAppMessage(
      phone,
      {
        type: "text",
        text: { body: feedbackMessage },
      },
      phoneNumberId
    );

    userContext.currentQuestionIndex++;
    if (userContext.currentQuestionIndex < userContext.questions.length) {
      setTimeout(async () => {
        await sendQuestionTrivia(
          phone,
          phoneNumberId,
          userContext.questions[userContext.currentQuestionIndex],
          userContext.currentQuestionIndex + 1,
          userContext.questions.length
        );
      }, 1000);
    } else {
      userContext.state = GAME_STATES.GAME_OVER;
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
      await sendWhatsAppMessage(
        phone,
        {
          type: "text",
          text: { body: finalMessage },
        },
        phoneNumberId
      );
    }
    gameManager.userContexts.set(phone, userContext);
  }
}

async function handleTextMessagesTrivia(message, phone, phoneNumberId) {
  // Handle join command for multiplayer if needed
  if (message.text.body.toLowerCase().startsWith("join ")) {
    const parts = message.text.body.split(" ");
    if (parts.length >= 2) {
      const gameId = parts[1];
      const session = gameManager.getSession(gameId);
      if (!session) {
        await sendWhatsAppMessage(
          phone,
          {
            type: "text",
            text: {
              body: "Game session not found. Please check the link and try again.",
            },
          },
          phoneNumberId
        );
        return;
      }
      if (session.guestPlayer) {
        await sendWhatsAppMessage(
          phone,
          {
            type: "text",
            text: { body: "This game session already has a guest player." },
          },
          phoneNumberId
        );
        return;
      }
      session.guestPlayer = phone;
      session.scores[phone] = 0;
      const guestContext = {
        state: GAME_STATES.IN_GAME,
        score: 0,
        questions: session.questions,
        currentQuestionIndex: 0,
        topic: session.topic,
        gameId: session.gameId,
      };
      gameManager.userContexts.set(phone, guestContext);
      const hostContext = gameManager.userContexts.get(session.hostPlayer);
      if (hostContext) {
        hostContext.gameId = session.gameId;
        gameManager.userContexts.set(session.hostPlayer, hostContext);
      }
      session.currentTurn = session.hostPlayer;
      await sendWhatsAppMessage(
        phone,
        {
          type: "text",
          text: { body: "You've joined the game! Wait for your turn." },
        },
        phoneNumberId
      );
      await sendWhatsAppMessage(
        session.hostPlayer,
        {
          type: "text",
          text: { body: "Your opponent has joined! It's your turn." },
        },
        phoneNumberId
      );
      gameManager.sessions.set(session.gameId, session);
      await sendQuestionTrivia(
        session.hostPlayer,
        phoneNumberId,
        session.questions[0],
        1,
        session.questions.length
      );
      return;
    }
  }

  const userContext = gameManager.userContexts.get(phone) || {
    state: GAME_STATES.IDLE,
  };
  if (message.text.body.toLowerCase() === "play") {
    userContext.state = GAME_STATES.TOPIC_SELECTION;
    gameManager.userContexts.set(phone, userContext);
    await sendWelcomeMessageTrivia(phone, phoneNumberId);
    return;
  }
  if (message.text.body.toLowerCase() === "help") {
    await sendHelpMessageTrivia(phone, phoneNumberId);
    return;
  }
  switch (userContext.state) {
    case GAME_STATES.QUESTION_COUNT:
      await handleQuestionCountInputTrivia(
        message.text.body,
        phone,
        phoneNumberId
      );
      break;
    case GAME_STATES.IN_GAME:
      await handleGameAnswerTrivia(message.text.body, phone, phoneNumberId);
      break;
    default:
      await sendDefaultMessageTrivia(phone, phoneNumberId);
  }
}

async function handleInteractiveMessageTrivia(message, phone, phoneNumberId) {
  const interactive = message.interactive;
  const replyId = interactive.list_reply
    ? interactive.list_reply.id
    : interactive.button_reply
    ? interactive.button_reply.id
    : null;

  if (!replyId) {
    console.error("No valid interactive reply found (Trivia).");
    return;
  }

  if (replyId.startsWith("topic_")) {
    const topic = replyId.replace("topic_", "");
    await handleTopicSelectionTrivia(topic, phone, phoneNumberId);
  } else if (replyId === "single_player") {
    await startSinglePlayerGameTrivia(phone, phoneNumberId);
  } else if (replyId === "multiplayer") {
    await startMultiplayerGameTrivia(phone, phoneNumberId);
  } else if (replyId.startsWith("answer_")) {
    const answer = replyId.replace("answer_", "");
    await handleGameAnswerTrivia(answer, phone, phoneNumberId);
  }
}

async function handleTopicSelectionTrivia(topic, phone, phoneNumberId) {
  await sendWhatsAppMessage(
    phone,
    {
      type: "interactive",
      interactive: {
        type: "button",
        body: {
          text: `*Game mode*\nChoose an option\n(Multiplayer coming soon)`,
        },
        action: {
          buttons: [
            {
              type: "reply",
              reply: { id: "single_player", title: "Single Player" },
            },
          ],
        },
      },
    },
    phoneNumberId
  );
  const userContext = gameManager.userContexts.get(phone) || {};
  userContext.topic = topic;
  userContext.state = GAME_STATES.QUESTION_COUNT;
  gameManager.userContexts.set(phone, userContext);
}

async function startSinglePlayerGameTrivia(phone, phoneNumberId) {
  await sendWhatsAppMessage(
    phone,
    {
      type: "text",
      text: {
        body: "How many questions would you like? (Enter a number between 5-20)",
      },
    },
    phoneNumberId
  );
}

async function startMultiplayerGameTrivia(phone, phoneNumberId) {
  const gameId = gameManager.createSession(phone);
  await firestore
    .collection("games")
    .doc(gameId)
    .set({
      hostPlayer: phone,
      status: "waiting",
      topic: gameManager.userContexts.get(phone).topic,
      createdAt: new Date(),
    });
  const topic = gameManager.userContexts.get(phone).topic;
  const questionCount = 5;
  const questions = await generateQuestionsWithRetry(topic, questionCount);
  const session = gameManager.getSession(gameId);
  session.questions = questions;
  session.currentQuestionIndex = 0;
  session.scores[phone] = 0;
  const hostContext = gameManager.userContexts.get(phone) || {};
  hostContext.state = GAME_STATES.IN_GAME;
  hostContext.score = 0;
  hostContext.questions = questions;
  hostContext.currentQuestionIndex = 0;
  hostContext.topic = topic;
  hostContext.gameId = gameId;
  gameManager.userContexts.set(phone, hostContext);

  const gameLink = `https://triviatrialsmessaging.onrender.com/join/${gameId}`;
  await sendWhatsAppMessage(
    phone,
    {
      type: "text",
      text: {
        body: `Share this link with your opponent to join the game: ${gameLink}`,
      },
    },
    phoneNumberId
  );
}

// --- Trivia Webhook Join Route ---
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

/**
 * ------------------------------------------------------
 * GIOMESSAGING APP SECTION
 * ------------------------------------------------------
 */

// In-memory store for Giomessaging user contexts
const userContexts = new Map();
// Set to track processed messages for deduplication
const processedMessages = new Set();

// --- Giomessaging: Mobile Money Selection ---
const handleMobileMoneySelection = async (buttonId, phone, phoneNumberId) => {
  const userContext = userContexts.get(phone);
  if (!userContext) {
    console.log("No user context found for phone:", phone);
    return;
  }
  const vendorNumber = "320297"; // Default vendor number
  const currentCurrency = userContext.currency || "RWF"; // Default currency
  let callToActionMessage = "";

  if (currentCurrency === "RWF") {
    if (buttonId === "mtn_momo") {
      callToActionMessage = `*Pay*\nPlease pay with\nMTN MoMo to ${vendorNumber}, name Nkundino Mini Supermarket`;
    } else if (buttonId === "airtel_mobile_money") {
      callToActionMessage = `*Pay*\nPlease pay with\nAirtel Money to ${vendorNumber}, name Nkundino Mini Supermarket`;
    } else {
      console.log("Unrecognized mobile money option for Rwanda:", buttonId);
      return;
    }
  } else if (currentCurrency === "XOF") {
    if (buttonId === "mtn_momo") {
      callToActionMessage = `Veuillez payer avec\nMTN Mobile Money au ${vendorNumber}, nom Nkundino Mini Supermarket\n____________________\nVotre commande est en cours de traitement et sera livrée sous peu.`;
    } else if (buttonId === "airtel_mobile_money") {
      callToActionMessage = `Veuillez payer avec\nAirtel Money au ${vendorNumber}, nom Nkundino Mini Supermarket\n____________________\nVotre commande est en cours de traitement et sera livrée sous peu.`;
    } else {
      console.log("Unrecognized mobile money option for Togo:", buttonId);
      return;
    }
  } else {
    console.log("Unsupported currency:", currentCurrency);
    return;
  }

  const redirectPayload = {
    type: "text",
    text: { body: callToActionMessage },
  };

  await sendWhatsAppMessage(phone, redirectPayload, phoneNumberId);
};

// --- Giomessaging: Order Handling ---
const handleOrder = async (
  message,
  changes,
  displayPhoneNumber,
  phoneNumberId
) => {
  const order = message.order;
  const orderId = message.id;
  const customerInfo = {
    phone: changes.value.contacts[0].wa_id,
    receiver: displayPhoneNumber,
  };
  const items = order.product_items;
  const totalAmount = items.reduce(
    (total, item) => total + item.item_price * item.quantity,
    0
  );
  const userContext = userContexts.get(customerInfo.phone) || {};
  userContext.order = {
    orderId,
    customerInfo,
    items,
    totalAmount,
  };
  userContexts.set(customerInfo.phone, userContext);

  try {
    await sendOrderPrompt(customerInfo.phone, phoneNumberId);
    console.log("Order saved successfully.");
  } catch (error) {
    console.error("Error saving order:", error.message);
  }
};

const handleTextMessages = async (message, phone, phoneNumberId) => {
  const messageText = message.text.body.trim().toLowerCase();

  switch (messageText) {
    case "adminclear":
      userContexts.clear();
      console.log("All user contexts reset.");
      break;
    case "clear":
      userContexts.delete(phone);
      console.log("User context reset.");
      break;
    case "gura":
    case "shop":
    case "haha":
    case "products":
    case "nkundino":
      console.log("User requested the menu.");
      const categories = [
        "juice",
        //"margarine",
        //"dairy-products",
        "rice",
        "flour-and-composite-flour",
        "cooking-and-olive-oil",
        "bread-and-bakery-items",
        "vegetables",
        "fruits",
        "mayonaise-ketchup-mustard",
        //"tooth-brush-and-mouth-wash",
        "body-soaps",
        "lotion",
        //"shampoo-conditioner",
      ];
      await sendCategoryList(phone, phoneNumberId, categories);
      break;
    default:
      console.log(`Received unrecognized message: ${messageText}`);
  }
};

const handleLocation = async (location, phone, phoneNumberId) => {
  try {
    const userContext = userContexts.get(phone);
    if (!userContext || !userContext.order) {
      console.log("No order found in user context.");
      await sendWhatsAppMessage(
        phone,
        {
          type: "text",
          text: { body: "No active order found. Please place an order first." },
        },
        phoneNumberId
      );
      return;
    }
    const { orderIdx, customerInfo, items } = userContext.order;
    const catalogProducts = await fetchFacebookCatalogProducts();
    const enrichedItems = items.map((item) => {
      const productDetails = catalogProducts.find(
        (product) => product.retailer_id === item.product_retailer_id
      );
      return {
        product: item.product_retailer_id,
        quantity: item.quantity,
        price: item.item_price,
        currency: item.currency,
        product_name: productDetails?.name || "Unknown Product",
        product_image: productDetails?.image_url || "defaultImage.jpg",
      };
    });
    const currencies = enrichedItems[0].currency;
    let vendorNumber = "+250788767816";
    let currentCurrency = "RWF";
    let countryCodeText = "RW";
    if (currencies === "XOF") {
      vendorNumber = "+22892450808";
      currentCurrency = "XOF";
      countryCodeText = "TG";
    }
    function orderNumber() {
      const randomNum = Math.floor(1 + Math.random() * (10000000 - 1));
      const now = new Date();
      const dateStr = now.toISOString().slice(0, 10).replace(/-/g, "");
      const formattedNum = randomNum.toString().padStart(6, "0");
      return `ORD-${dateStr}-${formattedNum}`;
    }
    const orderidd = orderNumber();
    const orderData = {
      orderId: orderidd,
      phone: customerInfo.phone,
      currency: currentCurrency,
      countryCode: countryCodeText,
      amount: enrichedItems.reduce(
        (total, item) => total + item.price * item.quantity,
        0
      ),
      products: enrichedItems,
      user: `+${customerInfo.phone}`,
      date: new Date(),
      paid: false,
      rejected: false,
      served: false,
      accepted: false,
      vendor: vendorNumber,
      deliveryLocation: {
        latitude: location.latitude,
        longitude: location.longitude,
      },
    };
    const docRef = await firestore
      .collection("whatsappOrdersNkundino")
      .add(orderData);
    console.log("Order saved successfully to Firebase with ID:", docRef.id);

    try {
      const orderDoc = await docRef.get();
      const orderData = orderDoc.data();
      await axios.post(
        `https://triviatrialsmessaging.onrender.com/api/send-order-confirmation`,
        {
          orderId: orderData.orderId,
        }
      );
      console.log(
        "Order confirmation endpoint triggered for order:",
        orderData.orderId
      );
    } catch (error) {
      console.error(
        "Error triggering order confirmation endpoint:",
        error
      );
    }

    await sendWhatsAppMessage(
      phone,
      {
        type: "interactive",
        interactive: {
          type: "button",
          body: { text: "Proceed to payment" },
          action: {
            buttons: [
              {
                type: "reply",
                reply: { id: "mtn_momo", title: "MTN MoMo" },
              },
            ],
          },
        },
      },
      phoneNumberId
    );

    userContext.stage = "EXPECTING_MTN_AIRTEL";
    userContext.docReference = docRef;
    userContext.vendorNumber = vendorNumber;
    userContext.currency = currentCurrency;
    userContexts.set(phone, userContext);
    console.log("Location updated and order saved successfully.");
  } catch (error) {
    console.error("Error processing location and saving order:", error.message);
    await sendWhatsAppMessage(
      phone,
      {
        type: "text",
        text: {
          body: `Sorry, there was an error processing your location: ${error.message}. Please try again.`,
        },
      },
      phoneNumberId
    );
  }
};

const handleLocationOld = async (location, phone, phoneNumberId) => {
  try {
    const userContext = userContexts.get(phone);
    if (!userContext || !userContext.order) {
      console.log("No order found in user context.");
      await sendWhatsAppMessage(
        phone,
        {
          type: "text",
          text: { body: "No active order found. Please place an order first." },
        },
        phoneNumberId
      );
      return;
    }
    const { orderIdx, customerInfo, items } = userContext.order;
    const catalogProducts = await fetchFacebookCatalogProducts();
    const enrichedItems = items.map((item) => {
      const productDetails = catalogProducts.find(
        (product) => product.retailer_id === item.product_retailer_id
      );
      return {
        product: item.product_retailer_id,
        quantity: item.quantity,
        price: item.item_price,
        currency: item.currency,
        product_name: productDetails?.name || "Unknown Product",
        product_image: productDetails?.image_url || "defaultImage.jpg",
      };
    });
    const currencies = enrichedItems[0].currency;
    let vendorNumber = "+250788767816";
    let currentCurrency = "RWF";
    let countryCodeText = "RW";
    if (currencies === "XOF") {
      vendorNumber = "+22892450808";
      currentCurrency = "XOF";
      countryCodeText = "TG";
    }
    function orderNumber() {
      const randomNum = Math.floor(1 + Math.random() * (10000000 - 1));
      const now = new Date();
      const dateStr = now.toISOString().slice(0, 10).replace(/-/g, "");
      const formattedNum = randomNum.toString().padStart(6, "0");
      return `ORD-${dateStr}-${formattedNum}`;
    }
    const orderidd = orderNumber();
    const orderData = {
      orderId: orderidd,
      phone: customerInfo.phone,
      currency: currentCurrency,
      countryCode: countryCodeText,
      amount: enrichedItems.reduce(
        (total, item) => total + item.price * item.quantity,
        0
      ),
      products: enrichedItems,
      user: `+${customerInfo.phone}`,
      date: new Date(),
      paid: false,
      rejected: false,
      served: false,
      accepted: false,
      vendor: vendorNumber,
      deliveryLocation: {
        latitude: location.latitude,
        longitude: location.longitude,
      },
    };
    const docRef = await firestore
      .collection("whatsappOrdersNkundino")
      .add(orderData);
    console.log("Order saved successfully to Firebase with ID:", docRef.id);
    await sendWhatsAppMessage(
      phone,
      {
        type: "text",
        text: {
          body: "Please provide your TIN(e.g., 101589140) or 0 if no TIN:",
        },
      },
      phoneNumberId
    );
    userContext.stage = "EXPECTING_TIN";
    userContext.docReference = docRef;
    userContext.vendorNumber = vendorNumber;
    userContext.currency = currentCurrency;
    userContexts.set(phone, userContext);
    console.log("Location updated and order saved successfully.");
  } catch (error) {
    console.error("Error processing location and saving order:", error.message);
    await sendWhatsAppMessage(
      phone,
      {
        type: "text",
        text: {
          body: `Sorry, there was an error processing your location: ${error.message}. Please try again.`,
        },
      },
      phoneNumberId
    );
  }
};

// const processedMessages = new Set();

//app.post("/webhook", async (req, res) => {
  // This endpoint is combined below.
//});

// Giomessaging: Handle messages based on phone number ID
async function handlePhoneNumber2Logic(message, phone, changes, phoneNumberId) {
  switch (message.type) {
    case "order":
      await handleOrder(
        message,
        changes,
        changes.value.metadata.display_phone_number,
        phoneNumberId
      );
      break;
    case "text":
      await handleTextMessages(message, phone, phoneNumberId);
      const userContext = userContexts.get(phone) || {};
      if (userContext.stage === "EXPECTING_TIN") {
        const tin = message.text.body.trim();
        if (tin) {
          console.log(`User ${phone} provided TIN: ${tin}`);
          userContext.tin = tin;
          userContext.stage = "EXPECTING_MTN_AIRTEL";
          userContexts.set(phone, userContext);
          const docReferenc = userContext.docReference;
          await docReferenc.update({ TIN: userContext.tin });
          try {
            const orderDoc = await docReferenc.get();
            const orderData = orderDoc.data();
            await axios.post(
              `https://giomessaging.onrender.com/api/send-order-confirmation`,
              {
                orderId: orderData.orderId,
              }
            );
            console.log(
              "Order confirmation endpoint triggered for order:",
              orderData.orderId
            );
          } catch (error) {
            console.error(
              "Error triggering order confirmation endpoint:",
              error
            );
          }
          await sendWhatsAppMessage(
            phone,
            {
              type: "interactive",
              interactive: {
                type: "button",
                body: { text: "Proceed to payment" },
                action: {
                  buttons: [
                    {
                      type: "reply",
                      reply: { id: "mtn_momo", title: "MTN MoMo" },
                    },
                  ],
                },
              },
            },
            phoneNumberId
          );
          return;
        } else {
          await sendWhatsAppMessage(
            phone,
            {
              type: "text",
              text: { body: "Invalid TIN. Please provide a valid TIN." },
            },
            phoneNumberId
          );
          return;
        }
      }
      break;
    case "interactive":
      if (message.interactive.type === "button_reply") {
        const buttonId = message.interactive.button_reply.id;
        if (buttonId.startsWith("confirm_") || buttonId.startsWith("cancel_")) {
          const orderId = buttonId.split("_")[1];
          const orderSnapshot = await firestore
            .collection("whatsappOrdersNkundino")
            .where("orderId", "==", orderId)
            .get();
          if (!orderSnapshot.empty) {
            const docRef = orderSnapshot.docs[0].ref;
            const orderData = orderSnapshot.docs[0].data();
            const customerPhone = orderData.phone;
            if (buttonId.startsWith("confirm_")) {
              await docRef.update({ paid: true });
              await sendWhatsAppMessage(
                customerPhone,
                {
                  type: "text",
                  text: {
                    body: `*Thank you*\nWe received your payment successfully! Your order is being processed and will be delivered soon`,
                  },
                },
                phoneNumberId
              );
            } else if (buttonId.startsWith("cancel_")) {
              await docRef.update({ rejected: true });
              await sendWhatsAppMessage(
                customerPhone,
                {
                  type: "text",
                  text: {
                    body: `*Oops*\nOrder cancelled. Please contact us on +250788640995`,
                  },
                },
                phoneNumberId
              );
            }
          }
          return;
        } else if (buttonId === "CHECKOUT") {
          const locationRequestPayload = {
            type: "interactive",
            interactive: {
              type: "location_request_message",
              body: { text: "Share your delivery location" },
              action: { name: "send_location" },
            },
          };
          await sendWhatsAppMessage(
            phone,
            locationRequestPayload,
            phoneNumberId
          );
          return;
        } else if (buttonId === "MORE") {
          const categories = [
            "juice",
            //"margarine",
           //"dairy-products",
            "rice",
            "flour-and-composite-flour",
            "cooking-and-olive-oil",
            "bread-and-bakery-items",
            "vegetables",
            "fruits",
            "mayonaise-ketchup-mustard",
            //"tooth-brush-and-mouth-wash",
            "body-soaps",
            "lotion",
            //"shampoo-conditioner",
          ];
          await sendCategoryList(phone, phoneNumberId, categories);
          return;
        }
        const userContext = userContexts.get(phone) || {};
        if (userContext.stage === "EXPECTING_MTN_AIRTEL") {
          await handleMobileMoneySelection(buttonId, phone, phoneNumberId);
          console.log("Expecting MTN & AIRTEL button reply");
          return;
        }
      } else if (message.interactive.type === "list_reply") {
        const selectedCategory = message.interactive.list_reply.id;
        console.log("User selected category:", selectedCategory);
        await sendCatalogForCategory(phone, phoneNumberId, selectedCategory);
      }
      break;
    case "location":
      await handleLocation(message.location, phone, phoneNumberId);
      break;
    default:
      console.log("Unrecognized message type:", message.type);
  }
}

// --- Giomessaging: Catalog and Order-related Functions ---
function capitalizeCategory(category) {
  return category
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function formatCategoryTitle(category) {
  // First capitalize as before
  const capitalized = category
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
  
  // Then truncate to 24 characters if needed
  return capitalized.length > 24 
    ? capitalized.substring(0, 21) + "..." 
    : capitalized;
}

async function sendCategoryList(phone, phoneNumberId, categories) {
  try {
    const rows = categories.map((cat) => ({
      id: cat,
      title: formatCategoryTitle(cat),
    }));
    const payload = {
      messaging_product: "whatsapp",
      to: phone,
      type: "interactive",
      interactive: {
        type: "list",
        header: { type: "text", text: "Welcome to Nkundino App!" },
        body: { text: "Please choose a category to view products:" },
        footer: { text: "Get your groceries delivered" },
        action: {
          button: "Select Category",
          sections: [{ title: "Categories", rows }],
        },
      },
    };
    const url = `https://graph.facebook.com/${VERSION}/${phoneNumberId}/messages`;
    const response = await axios({
      method: "POST",
      url,
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      data: payload,
    });
    console.log("Category list sent successfully to:", phone);
    return response.data;
  } catch (error) {
    console.error(
      "Error sending category list:",
      error.response?.data || error.message
    );
    throw error;
  }
}



async function sendCatalogChunk(phone, phoneNumberId, category, productRetailerIdsChunk) {
  try {
    // Use a helper function to capitalize the category (if desired)
    const formattedCategory = capitalizeCategory(category);
    
    const url = `https://graph.facebook.com/${VERSION}/${phoneNumberId}/messages`;
    const payload = {
      messaging_product: "whatsapp",
      to: phone,
      type: "interactive",
      interactive: {
        type: "product_list",
        header: { 
          type: "text",
          text: formattedCategory  // Use the properly formatted category without truncation
        },
        body: { text: "Our products:" },
        action: {
          catalog_id: "3886617101587200", // Your app.js 1 catalog ID
          sections: [{
            title: formattedCategory,
            product_items: productRetailerIdsChunk.map(id => ({
              product_retailer_id: id,
            })),
          }],
        },
      },
    };

    console.log("Sending catalog payload:", JSON.stringify(payload, null, 2));
    
    const response = await axios({
      method: "POST",
      url,
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      data: payload,
    });
    
    console.log(`Catalog chunk sent successfully for category ${formattedCategory}`);
    return response.data;
  } catch (error) {
    console.error(
      "Error sending catalog chunk:",
      error.response?.data || error.message
    );
    throw error;
  }
}


async function sendCatalogChunkOld(phone, phoneNumberId, category, productRetailerIdsChunk) {
  try {
    // Format category name for display
    const formattedCategory = formatCategoryTitle(category);
    const shortCategory = formattedCategory.length > 24 
      ? formattedCategory.substring(0, 21) + "..."
      : formattedCategory;

    const url = `https://graph.facebook.com/${VERSION}/${phoneNumberId}/messages`;
    const payload = {
      messaging_product: "whatsapp",
      to: phone,
      type: "interactive",
      interactive: {
        type: "product_list",
        header: { 
          type: "text",
          text: formattedCategory.length > 24 
            ? formattedCategory.substring(0, 21) + "..." 
            : formattedCategory
        },
        body: { text: "Our products:" },
        action: {
          catalog_id: "3886617101587200",
          sections: [{
            title: shortCategory,
            product_items: productRetailerIdsChunk.map((id) => ({
              product_retailer_id: id,
            })),
          }],
        },
      },
    };

    console.log("Sending catalog payload:", JSON.stringify(payload, null, 2));
    
    const response = await axios({
      method: "POST",
      url,
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      data: payload,
    });
    
    console.log(`Catalog chunk sent successfully for category ${shortCategory}`);
    return response.data;
  } catch (error) {
    console.error(
      "Error sending catalog chunk:",
      error.response?.data || error.message
    );
    throw error;
  }
}

function chunkArray(array, chunkSize) {
  const chunks = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
}

async function fetchProductRetailerIDs(category) {
  try {
    const snapshot = await firestore
      .collection("nkundinoproducts")
      .where("category", "==", category)
      .get();
    if (snapshot.empty) {
      console.warn("No products found for category:", category);
      return [];
    }
    return snapshot.docs.map((doc) => doc.id);
  } catch (error) {
    console.error(
      "Error fetching products for category:",
      category,
      error.message
    );
    return [];
  }
}

async function sendCatalogForCategory(phone, phoneNumberId, category) {
  const productRetailerIds = await fetchProductRetailerIDs(category);
  if (!productRetailerIds || productRetailerIds.length === 0) {
    console.error("No product IDs fetched for category:", category);
    return;
  }
  const chunks = chunkArray(productRetailerIds, 30);
  for (const chunk of chunks) {
    await sendCatalogChunk(phone, phoneNumberId, category, chunk);
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}



app.post("/api/save-order", async (req, res) => {
  console.log("Incoming order data:", req.body);
  const { orderId, customerInfo, items, deliveryLocation } = req.body;
  try {
    if (!orderId || !customerInfo || !items || items.length === 0) {
      return res.status(400).json({ message: "Invalid order data" });
    }
    const catalogProducts = await fetchFacebookCatalogProducts();
    const enrichedItems = items.map((item) => {
      const productDetails = catalogProducts.find(
        (product) => product.retailer_id === item.product_retailer_id
      );
      return {
        product: item.product_retailer_id,
        quantity: item.quantity,
        price: item.item_price,
        currency: item.currency,
        product_name: productDetails?.name || "Unknown Product",
        product_image: productDetails?.image_url || "defaultImage.jpg",
      };
    });
    const currencies = enrichedItems[0].currency;
    let vendorNumber = "+250788767816";
    let currentCurrency = "RWF";
    if (currencies == "XOF") {
      vendorNumber = "+22892450808";
      currentCurrency = "XOF";
    }
    let currentOrder = 0;
    function orderNumber() {
      const randomNum = uuidv4().split("-")[0];
      currentOrder += 1;
      const now = new Date();
      const dateStr = now.toISOString().slice(0, 10).replace(/-/g, "");
      const formattedNum = randomNum.slice(0, 6).padStart(6, "0");
      return `ORD-${dateStr}-${formattedNum}`;
    }
    const orderidd = orderNumber();
    const orderData = {
      orderId: orderidd,
      phone: customerInfo.phone,
      currency: currentCurrency,
      amount: enrichedItems.reduce(
        (total, item) => total + item.price * item.quantity,
        0
      ),
      products: enrichedItems,
      user: `+${customerInfo.phone}`,
      date: new Date(),
      paid: false,
      rejected: false,
      served: false,
      accepted: false,
      vendor: vendorNumber,
      tin: userContext?.tin,
      deliveryLocation: deliveryLocation || null,
    };
    const docRef = await firestore
      .collection("whatsappOrdersNkundino")
      .add(orderData);
    console.log("Order saved successfully with ID:", docRef.id);
    res
      .status(200)
      .json({ message: "Order saved successfully", order: orderData });
  } catch (error) {
    console.error("Error saving order:", error.message);
    res
      .status(500)
      .json({ message: "An error occurred while saving the order" });
  }
});

async function fetchFacebookCatalogProducts() {
  const url = `https://graph.facebook.com/v12.0/3886617101587200/products?fields=id,name,description,price,image_url,retailer_id`;
  let products = [];
  let nextPage = url;
  try {
    while (nextPage) {
      const response = await axios.get(nextPage, {
        headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
      });
      products = products.concat(response.data.data);
      nextPage = response.data.paging?.next || null;
    }
    console.log("Fetched products with images:", products);
    return products;
  } catch (error) {
    console.error(
      "Error fetching catalog products:",
      error.response?.data || error.message
    );
    throw error;
  }
}

async function sendOrderPrompt(phone, phoneNumberId) {
  const userContext = userContexts.get(phone) || {};
  const payload = {
    type: "interactive",
    interactive: {
      type: "button",
      body: {
        text: `*Your order’s looking good!*\nWant to add anything else before checkout?`,
      },
      action: {
        buttons: [
          { type: "reply", reply: { id: "MORE", title: "More" } },
          { type: "reply", reply: { id: "CHECKOUT", title: "Checkout" } },
        ],
      },
    },
  };
  await sendWhatsAppMessage(phone, payload, phoneNumberId);
  userContext.stage = "SEND_TIN_MESSAGE";
  userContexts.set(phone, userContext);
}


app.post("/api/send-order-confirmation", async (req, res) => {
  try {
    const { orderId } = req.body;
    
    if (!orderId) {
      return res.status(400).json({ message: "Order ID is required" });
    }

    // Get the active admin phone number from Firebase
    const adminPhoneSnapshot = await firestore
      .collection("adminPhone")
      .where("isActive", "==", true)
      .limit(1)
      .get();

    if (adminPhoneSnapshot.empty) {
      return res.status(400).json({ message: "No active admin phone number found" });
    }

    const ADMIN_PHONE = adminPhoneSnapshot.docs[0].data().number;

    // Get the order details
    const orderSnapshot = await firestore
      .collection("whatsappOrdersNkundino")
      .where("orderId", "==", orderId)
      .get();

    if (orderSnapshot.empty) {
      return res.status(404).json({ message: "Order not found" });
    }

    const orderData = orderSnapshot.docs[0].data();
    const docRef = orderSnapshot.docs[0].ref;
    
    const orderDetails = orderData.products
      .map(
        (product) =>
          `${product.product_name} x${product.quantity} - ${
            product.price * product.quantity
          } ${product.currency}`
      )
      .join("\n");

    const messageBody = `New Order Received!\n\nOrder ID: ${orderData.orderId}\nCustomer Phone: ${orderData.phone}\nTotal Amount: ${orderData.amount} ${orderData.currency}\n\nItems:\n${orderDetails}\n\nPlease confirm or cancel this order.`;

    const messagePayload = {
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: messageBody },
        action: {
          buttons: [
            {
              type: "reply",
              reply: { id: `confirm_${orderId}`, title: "Confirm" },
            },
            {
              type: "reply",
              reply: { id: `cancel_${orderId}`, title: "Cancel" },
            },
          ],
        },
      },
    };

    await sendWhatsAppMessage(ADMIN_PHONE, messagePayload, "611707258686108");
    
    res.status(200).json({
      message: "Order confirmation message sent successfully to admin",
      adminPhone: ADMIN_PHONE // Optional: return the phone number used
    });
    
  } catch (error) {
    console.error("Error sending order confirmation:", error);
    res.status(500).json({ 
      message: "Failed to send order confirmation message",
      error: error.message 
    });
  }
});

/**
 * ------------------------------------------------------
 * COMBINED WEBHOOK ENDPOINT
 * ------------------------------------------------------
 *
 * This single /webhook endpoint distinguishes between Trivia and Giomessaging
 * based on the phoneNumberId.
 */
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

    // Check if message contains Nkundino keywords
    const nkundinoKeywords = ['shop', 'products', 'nkundino', 'gura', 'haha'];
    const isNkundinoMessage = message.type === 'text' && 
      nkundinoKeywords.includes(message.text.body.trim().toLowerCase());

    if (isNkundinoMessage) {
      // Process with Nkundino bot
      const uniqueMessageId = `${phoneNumberId}-${message.id}`;
      if (!processedMessages.has(uniqueMessageId)) {
        processedMessages.add(uniqueMessageId);
        try {
          await handlePhoneNumber2Logic(message, phone, changes, phoneNumberId);
        } catch (err) {
          console.error("Error processing Nkundinomessaging message:", err.message);
        } finally {
          setTimeout(() => processedMessages.delete(uniqueMessageId), 300000);
        }
      }
    } else {
      // Process with Trivia bot
      await trackUser(phone);
      try {
        switch (message.type) {
          case "text":
            await handleTextMessagesTrivia(message, phone, phoneNumberId);
            break;
          case "interactive":
            await handleInteractiveMessageTrivia(message, phone, phoneNumberId);
            break;
          default:
            await sendDefaultMessageTrivia(phone, phoneNumberId);
        }
      } catch (err) {
        console.error("Error processing Trivia message:", err);
      }
    }
  }
  res.sendStatus(200);
});

// Webhook verification endpoint (shared)
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

/**
 * ------------------------------------------------------
 * TEST CONNECTION & SERVER STARTUP
 * ------------------------------------------------------
 */
async function testWhatsAppConnection() {
  try {
    const response = await axios.get(
      `https://graph.facebook.com/${VERSION}/me`,
      { headers: { Authorization: `Bearer ${ACCESS_TOKEN}` } }
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

const port = process.env.PORT || 5000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
  testWhatsAppConnection();
});
