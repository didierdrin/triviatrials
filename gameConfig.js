// gameConfig.js

import { v4 as uuidv4 } from "uuid";

export const TOPICS = [
  "Science",
  "History",
  "Geography",
  "Entertainment",
  "Sports",
  "Technology"
];

export const GAME_STATES = {
  IDLE: 'IDLE',
  TOPIC_SELECTION: 'TOPIC_SELECTION',
  QUESTION_COUNT: 'QUESTION_COUNT',
  WAITING_FOR_OPPONENT: 'WAITING_FOR_OPPONENT',
  IN_GAME: 'IN_GAME',
  GAME_OVER: 'GAME_OVER'
};

export class GameSession {
  constructor(gameId, hostPlayer) {
    this.gameId = gameId;
    this.hostPlayer = hostPlayer;
    this.guestPlayer = null;
    this.topic = null;
    this.questionCount = 0;
    this.questions = [];
    this.currentQuestionIndex = 0;
    this.scores = {};
    this.answers = {};
    this.status = "waiting";  // waiting, in-progress, or completed
    this.currentTurn = null;  // phone number of player whose turn it is
  }
}

export const gameManager = {
  sessions: new Map(),
  userContexts: new Map(),

  createSession(hostPlayer) {
    const gameId = uuidv4();
    const session = new GameSession(gameId, hostPlayer);
    this.sessions.set(gameId, session);
    return gameId;
  },
  getSession(gameId) {
    return this.sessions.get(gameId);
  }
};
