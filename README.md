EduPlay: An Accessible Voice-First Quiz Game
Welcome to EduPlay, an interactive quiz game designed with a core mission: to make learning accessible and engaging for users with visual impairments. Built for a hackathon, this Next.js application leverages the power of voice to create a completely hands-free and screen-reader-friendly educational experience.

🎯 Project Vision & Hackathon Goal
The core idea behind this web application was to create a hands-free, accessible, and engaging quiz experience by integrating voice interaction into a traditional quiz format. Instead of relying on visual cues and UI interactions, our web app speaks out each question using text-to-speech, listens to the user's spoken response through speech recognition, and provides immediate audio feedback.

Our intent is to:

Make learning more immersive and interactive, especially for users who benefit from auditory learning.

Improve accessibility for users with visual impairments, providing a seamless experience without needing to see the screen.

Explore and demonstrate the integration of web audio APIs, voice recognition, and real-time UI feedback in a modern web stack.

🚀 Key Accessibility Features
Voice-First Interaction: The primary method of interaction is voice. The app automatically listens for answers, creating a natural conversational flow.

Full Audio-Based Experience: All questions, options, and feedback are read aloud via the Web Speech API, eliminating the need for screen-based reading.

AI-Powered Speech Recognition: Utilizes the Gemini 1.5 Flash model to accurately process and understand spoken answers.

Immediate Audio Feedback: Users receive instant audio cues and spoken explanations for both correct and incorrect answers.

Accessible UI: While fully functional via voice, the interface is designed to be clean and responsive. Manual button controls are available as a secondary interaction method.

Engaging Sound Effects: Audio cues for starting/stopping recording and for correct/incorrect answers enhance the interactive experience.

🛠️ Technologies Used
Framework: Next.js (React)

Styling: Tailwind CSS

AI: Google Gemini API for audio-to-text transcription.

Web APIs:

Web Speech API (SpeechSynthesis) for text-to-speech.

MediaStream API (getUserMedia) for microphone access.

Web Audio API for sound effects and voice visualization.

UI Components: shadcn/ui (for the Button component)

Icons: Lucide React

⚙️ Setup and Installation
Follow these steps to get the project running on your local machine.

1. Clone the Repository
First, clone the project repository to your local machine:

git clone [<your-repository-url>](https://github.com/bebialen/accessible-quiz-game.git)
cd <repository-folder>

2. Install Dependencies
Install the necessary npm packages:

npm install 
or 
npm install --legacy-peer-deps 

3. Set Up Environment Variables
This project requires an API key from Google AI Studio to use the Gemini API.

Create a file named .env in the root of your project.

Add your Gemini API key to this file:

NEXT_PUBLIC_GEMINI_API_KEY=YOUR_GEMINI_API_KEY_HERE

Note: You can get a free API key from Google AI Studio.

4. Run the Development Server
Start the Next.js development server:

npm run dev

Open http://localhost:3000 with your browser to see the result. You will need to grant microphone permissions when prompted by the browser to play the game.

🎮 How to Play (Voice-First)
Start the Game: Click the "Start Auto-Voice Game" button.

Listen: The game will read the first question and its options aloud.

Answer: After the question is read, the app will automatically start listening. Speak your answer clearly (e.g., "Yes," "No," or the option text like "Bulldozer").

Feedback: The game will process your answer and provide immediate audio feedback and an explanation.

Next Question: The game automatically proceeds to the next question after a short delay.

Complete: Once all questions are answered, your final score is read aloud.

🧩 Component Overview

State Management: Uses useState for managing the game state (start, playing, feedback, complete), score, recording status, etc.

Refs: useRef is used extensively to hold references to the MediaRecorder, SpeechSynthesis, timers, and the current question index to prevent issues with stale state in asynchronous callbacks.

Effects: useEffect handles the initial setup of the speech synthesizer and cleanup of all resources when the component unmounts. It also syncs state with refs.

Core Functions:

speak(): Handles text-to-speech.

startRecording() / stopRecording(): Manages microphone input.

processAudioWithGemini(): Converts the audio blob to base64 and sends it to the Gemini API with a carefully crafted prompt.

handleVoiceCommand(): Interprets the response from Gemini.

handleAnswer(): Checks if an answer is correct and provides feedback.

readQuestion(): Composes and speaks the full question text.

🔮 Future Improvements

- Multiplayer & Team Mode: Enable users from around the world to compete or collaborate in real time.

- Realistic Audio: Integrate lifelike voice synthesis using OpenAI or Gemini for more immersive audio experiences.
- Dynamic Questions: Fetch questions from an external API or database to keep content fresh and relevant.

- User Accounts: Allow users to sign in and track their progress, scores, and achievements over time.

- More Rapid-Fire Rounds: Introduce various fast-paced question formats to keep the gameplay exciting.

- Additional Question Types: Support "fill-in-the-blank", "short answer", and other interactive formats.

- Customizable Settings: Let users adjust the voice, speech rate, or toggle audio features according to their preferences.

- Enhanced Error Handling: Display clear and user-friendly error messages to improve the user experience.
