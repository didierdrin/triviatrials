// geminiQuestionGenerator.js
import { GoogleGenerativeAI } from "@google/generative-ai";

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Cache to store previously generated questions
const questionCache = new Map();

// Function to generate a unique cache key
const generateCacheKey = (topic, questionIndex) => `${topic.toLowerCase()}_${questionIndex}`;

// Prompt templates for different difficulty levels
const DIFFICULTY_PROMPTS = {
  easy: "Create an easy multiple-choice trivia question about",
  medium: "Generate a moderately challenging multiple-choice trivia question about",
  hard: "Devise a difficult multiple-choice trivia question about"
};

// Subtopic mapping to ensure question diversity
const TOPIC_AREAS = {
  Science: [
    "Physics", "Chemistry", "Biology", "Astronomy", "Earth Science",
    "Environmental Science", "Medicine", "Technology", "Mathematics"
  ],
  History: [
    "Ancient Civilizations", "Middle Ages", "Renaissance", "Modern History",
    "World Wars", "Cold War", "Ancient Egypt", "Roman Empire", "Asian History"
  ],
  Geography: [
    "Physical Geography", "Human Geography", "Climate", "Natural Resources",
    "Countries and Capitals", "Landforms", "Oceans", "Cultural Geography"
  ],
  Entertainment: [
    "Movies", "Television", "Music", "Theater", "Video Games",
    "Books", "Comics", "Celebrities", "Pop Culture"
  ],
  Sports: [
    "Football", "Basketball", "Baseball", "Soccer", "Tennis",
    "Olympics", "Racing", "Combat Sports", "Winter Sports"
  ],
  Technology: [
    "Computer Science", "Internet", "Mobile Technology", "AI and Robotics",
    "Social Media", "Gaming", "Cybersecurity", "Innovation", "Space Technology"
  ]
};

// Function to generate the complete prompt for Gemini
function generateQuestionPrompt(topic, subtopic, difficulty, previousQuestions) {
  return `
Generate a unique ${difficulty} multiple-choice trivia question about ${topic} focusing on ${subtopic}.
The question should not be similar to these previous questions: ${previousQuestions.join(', ')}

Format the response exactly as follows:
{
  "question": "The complete question text",
  "options": [
    "First option (correct answer)",
    "Second option",
    "Third option",
    "Fourth option"
  ],
  "explanation": "Brief explanation of why the first option is correct"
}

Requirements:
1. Question should be clear and engaging
2. All options should be plausible
3. Options should be approximately the same length
4. No joke or obvious wrong answers
5. Question should test knowledge, not just common sense
6. Include specific facts or details
7. No true/false questions
8. The correct answer must always be the first option
`;
}

// Main question generation function
async function generateQuestions(topic, count) {
  const questions = [];
  const usedSubtopics = new Set();
  const previousQuestions = new Set();

  try {
    const model = genAI.getGenerativeModel({ model: "gemini-pro" });

    for (let i = 0; i < count; i++) {
      // Select difficulty based on progress
      const difficulty = i < count * 0.3 ? 'easy' : 
                        i < count * 0.7 ? 'medium' : 
                        'hard';

      // Select subtopic ensuring even distribution
      let availableSubtopics = TOPIC_AREAS[topic].filter(st => !usedSubtopics.has(st));
      if (availableSubtopics.length === 0) {
        usedSubtopics.clear();
        availableSubtopics = TOPIC_AREAS[topic];
      }
      const subtopic = availableSubtopics[Math.floor(Math.random() * availableSubtopics.length)];
      usedSubtopics.add(subtopic);

      // Generate cache key
      const cacheKey = generateCacheKey(topic, i);

      // Check cache first
      if (questionCache.has(cacheKey)) {
        questions.push(questionCache.get(cacheKey));
        continue;
      }

      // Generate prompt
      const prompt = generateQuestionPrompt(
        topic,
        subtopic,
        difficulty,
        Array.from(previousQuestions)
      );

      // Get response from Gemini
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();

      // Parse the response
      const questionData = JSON.parse(text);

      // Randomize the correct answer position
      const correctAnswer = questionData.options[0];
      const shuffledOptions = shuffleArray([...questionData.options]);
      const correctAnswerIndex = shuffledOptions.indexOf(correctAnswer);

      // Create the final question object
      const questionObject = {
        question: questionData.question,
        options: shuffledOptions,
        correctAnswerIndex,
        explanation: questionData.explanation,
        difficulty,
        subtopic
      };

      // Add to cache and questions array
      questionCache.set(cacheKey, questionObject);
      questions.push(questionObject);
      previousQuestions.add(questionData.question);

      // Implement rate limiting
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    return questions;

  } catch (error) {
    console.error('Error generating questions:', error);
    throw new Error('Failed to generate questions');
  }
}

// Helper function to shuffle array
function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

// Cache management functions
function clearQuestionCache() {
  questionCache.clear();
}

function removeCachedQuestion(topic, index) {
  const cacheKey = generateCacheKey(topic, index);
  questionCache.delete(cacheKey);
}

// Error handling wrapper
async function generateQuestionsWithRetry(topic, count, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const questions = await generateQuestions(topic, count);
      if (questions.length === count) {
        return questions;
      }
    } catch (error) {
      console.error(`Attempt ${i + 1} failed:`, error);
      if (i === maxRetries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
}

export {
  generateQuestions,
  generateQuestionsWithRetry,
  clearQuestionCache,
  removeCachedQuestion
};
