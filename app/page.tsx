"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Settings, User, Volume2 } from "lucide-react"

interface Question {
  id: number
  question: string
  type: "yesno" | "multiple"
  options?: string[]
  correctAnswer: string
  explanation: string
}

const questions: Question[] = [
  {
    id: 1,
    question: "What is the capital of France?",
    type: "multiple",
    options: ["Paris", "London", "Rome"],
    correctAnswer: "paris",
    explanation: "Correct! Paris is the capital of France!",
  },
  {
    id: 2,
    question: "Do cats like to play with yarn?",
    type: "yesno",
    correctAnswer: "yes",
    explanation: "Yes! Most cats love playing with yarn and string!",
  },
  {
    id: 3,
    question: "Can fish fly in the sky?",
    type: "yesno",
    correctAnswer: "no",
    explanation: "No! Fish swim in water, not fly in the sky!",
  },
  {
    id: 4,
    question: "What sound does a cow make?",
    type: "multiple",
    options: ["Meow", "Moo", "Woof"],
    correctAnswer: "moo",
    explanation: "Correct! Cows say 'Moo'!",
  },
  {
    id: 5,
    question: "Is the sun hot?",
    type: "yesno",
    correctAnswer: "yes",
    explanation: "Yes! The sun is very, very hot!",
  },
]

export default function AutoVoiceQuizGame() {
  const [gameState, setGameState] = useState<"start" | "playing" | "feedback" | "complete">("start")
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
  const [score, setScore] = useState(0)
  const [isRecording, setIsRecording] = useState(false)
  const [recordingTimeLeft, setRecordingTimeLeft] = useState(0)
  const [lastHeardCommand, setLastHeardCommand] = useState("")
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [voiceAmplitude, setVoiceAmplitude] = useState(0)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const synthRef = useRef<SpeechSynthesis | null>(null)
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null)
  const autoProgressTimerRef = useRef<NodeJS.Timeout | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  
  const GEMINI_API_KEY = process.env.NEXT_PUBLIC_GEMINI_API_KEY || "AIzaSyAPvOPgh2vPz1uxDhAMs0veZrqTv7p-2So"

  useEffect(() => {
    if ("speechSynthesis" in window) {
      synthRef.current = window.speechSynthesis
    }

    console.log(`the index from usestate is ${currentQuestionIndex}`)

    return () => {
      cleanupResources()
    }
  }, [])

  const cleanupResources = () => {
    if (recordingTimerRef.current) clearTimeout(recordingTimerRef.current)
    if (autoProgressTimerRef.current) clearTimeout(autoProgressTimerRef.current)
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current)

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop()
    }

    if (audioContextRef.current) {
      audioContextRef.current.close().catch(console.error)
    }

    if (synthRef.current) {
      synthRef.current.cancel()
    }
  }

  const speak = (text: string, rate = 0.8) => {
    if (synthRef.current) {
      synthRef.current.cancel()
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.rate = rate
      utterance.pitch = 1.1
      utterance.volume = 0.8
      synthRef.current.speak(utterance)
    }
  }

  const playRecordingStartSound = () => {
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
      const oscillator = audioContext.createOscillator()
      const gainNode = audioContext.createGain()

      oscillator.connect(gainNode)
      gainNode.connect(audioContext.destination)

      oscillator.frequency.setValueAtTime(800, audioContext.currentTime)
      oscillator.frequency.setValueAtTime(1000, audioContext.currentTime + 0.1)

      gainNode.gain.setValueAtTime(0.2, audioContext.currentTime)
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2)

      oscillator.start(audioContext.currentTime)
      oscillator.stop(audioContext.currentTime + 0.2)
    } catch (error) {
      console.error("Error playing start sound:", error)
    }
  }

  const playRecordingStopSound = () => {
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
      const oscillator = audioContext.createOscillator()
      const gainNode = audioContext.createGain()

      oscillator.connect(gainNode)
      gainNode.connect(audioContext.destination)

      oscillator.frequency.setValueAtTime(1000, audioContext.currentTime)
      oscillator.frequency.setValueAtTime(800, audioContext.currentTime + 0.1)

      gainNode.gain.setValueAtTime(0.2, audioContext.currentTime)
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2)

      oscillator.start(audioContext.currentTime)
      oscillator.stop(audioContext.currentTime + 0.2)
    } catch (error) {
      console.error("Error playing stop sound:", error)
    }
  }

  const setupAudioAnalyser = (stream: MediaStream) => {
    try {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)()
      const source = audioContextRef.current.createMediaStreamSource(stream)
      analyserRef.current = audioContextRef.current.createAnalyser()

      analyserRef.current.fftSize = 256
      source.connect(analyserRef.current)

      const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount)

      const updateAmplitude = () => {
        if (analyserRef.current && isRecording) {
          analyserRef.current.getByteFrequencyData(dataArray)
          const average = dataArray.reduce((a, b) => a + b) / dataArray.length
          setVoiceAmplitude(Math.min(average / 128, 2)) // Normalize to 0-2 range
          animationFrameRef.current = requestAnimationFrame(updateAmplitude)
        }
      }
      updateAmplitude()
    } catch (error) {
      console.error("Error setting up audio analyser:", error)
    }
  }

  const startRecording = async () => {
    try {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        return
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mediaRecorderRef.current = new MediaRecorder(stream)
      audioChunksRef.current = []

      setupAudioAnalyser(stream)

      mediaRecorderRef.current.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data)
      }

      mediaRecorderRef.current.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' })
        // await processAudioWithGemini(audioBlob)
        stream.getTracks().forEach(track => track.stop())
        if (audioContextRef.current) {
          audioContextRef.current.close().catch(console.error)
          audioContextRef.current = null
        }
        setVoiceAmplitude(0)
      }

      mediaRecorderRef.current.start()
      setIsRecording(true)
      setRecordingTimeLeft(10)
      playRecordingStartSound()

      const timer = setInterval(() => {
        setRecordingTimeLeft(prev => {
          if (prev <= 1) {
            clearInterval(timer)
            stopRecording()
            return 0
          }
          return prev - 1
        })
      }, 1000)

      recordingTimerRef.current = timer
    } catch (error) {
      console.error('Error accessing microphone:', error)
      alert('Could not access microphone. Please check permissions.')
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
      setRecordingTimeLeft(0)
      playRecordingStopSound()

      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current)
        recordingTimerRef.current = null
      }

      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
        animationFrameRef.current = null
      }
    }
  }

  // const processAudioWithGemini = async (audioBlob: Blob) => {
  //   if (!GEMINI_API_KEY) {
  //     alert('Please set your Gemini API key in environment variables')
  //     return
  //   }

  //   setIsProcessing(true)

  //   try {
  //     const arrayBuffer = await audioBlob.arrayBuffer()
  //     const base64Audio = btoa(
  //       new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
  //     )

  //     const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
  //       method: 'POST',
  //       headers: {
  //         'Content-Type': 'application/json',
  //       },
  //       body: JSON.stringify({
  //         contents: [
  //           {
  //             parts: [
  //               {
  //                 text: "Please transcribe this audio and extract only the spoken words. If it's a quiz answer, identify if they said 'yes', 'no', or mentioned any of these options: A, B, C, or specific words like 'Paris', 'London', 'Rome', 'Moo', 'Meow', 'Woof'. Return only the key words in lowercase."
  //               },
  //               {
  //                 inline_data: {
  //                   mime_type: "audio/webm",
  //                   data: base64Audio
  //                 }
  //               }
  //             ]
  //           }
  //         ]
  //       })
  //     })

  //     if (!response.ok) {
  //       throw new Error(`API request failed with status ${response.status}`)
  //     }

  //     const data = await response.json()

  //     if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
  //       const transcription = data.candidates[0].content.parts[0].text.toLowerCase().trim()
  //       setLastHeardCommand(transcription)
  //       handleVoiceCommand(transcription)
  //     } else {
  //       console.error('No transcription received from Gemini')
  //       setLastHeardCommand("Could not understand audio")
  //       setTimeout(() => {
  //         if (gameState === "playing") {
  //           startRecording()
  //         }
  //       }, 2000)
  //     }
  //   } catch (error) {
  //     console.error('Error processing audio with Gemini:', error)
  //     setLastHeardCommand("Error processing audio")
  //     setTimeout(() => {
  //       if (gameState === "playing") {
  //         startRecording()
  //       }
  //     }, 2000)
  //   } finally {
  //     setIsProcessing(false)
  //   }
  // }

  const handleVoiceCommand = (command: string) => {
    const currentQuestion = questions[currentQuestionIndex]

    if (gameState === "start") {
      if (command.includes("start") || command.includes("play") || command.includes("begin")) {
        startGame()
      }
      return
    }

    if (gameState === "playing") {
      if (command.includes("repeat") || command.includes("again")) {
        repeatQuestion()
        return
      }

      let answered = false

      if (currentQuestion.type === "yesno") {
        if (command.includes("yes") || command.includes("yeah") || command.includes("yep")) {
          handleAnswer("yes")
          answered = true
        } else if (command.includes("no") || command.includes("nope")) {
          handleAnswer("no")
          answered = true
        }
      } else if (currentQuestion.type === "multiple" && currentQuestion.options) {
        const options = currentQuestion.options.map(opt => opt.toLowerCase())
        if (command.includes("a") || options.some(opt => command.includes(opt))) {
          const matchedOption = options.find(opt => command.includes(opt)) || options[0]
          handleAnswer(matchedOption)
          answered = true
        } else if (command.includes("b") && options[1]) {
          handleAnswer(options[1])
          answered = true
        } else if (command.includes("c") && options[2]) {
          handleAnswer(options[2])
          answered = true
        }
      }

      if (!answered) {
        setTimeout(() => {
          if (gameState === "playing") {
            startRecording()
          }
        }, 2000)
      }
    }
  }

  const startGame = () => {
    if (!GEMINI_API_KEY) {
      alert('Please set your Gemini API key in environment variables')
      return
    }
    setGameState("playing")
    setCurrentQuestionIndex(0)
    setScore(0)
    setIsCorrect(null)
    setTimeout(() => {
      readQuestion()
    }, 500)
  }

  // const readQuestion = () => {
  //   const currentQuestion = questions[currentQuestionIndex]

  //   console.log(`currentQuestion ${currentQuestion}`);
  //   const progressText = `Question ${currentQuestionIndex + 1} of ${questions.length}.`
  //   console.log(`progress text ${progressText}`);
  //   const questionText = currentQuestion.question

  //   speak(`${progressText} ${questionText}`)

  //   // setTimeout(() => {
  //     startRecording()
  //   // }, 5000)
  // }

  const readQuestion = () => {
    const currentQuestion = questions[currentQuestionIndex];

    console.log(`currentQuestion ${JSON.stringify(currentQuestion)}`);
    const progressText = `Question ${currentQuestionIndex + 1} of ${questions.length}.`;
    console.log(`progress text ${progressText}`);
    const questionText = currentQuestion.question;

    const textToSpeak = `${progressText} ${questionText}`;
    const utterance = new SpeechSynthesisUtterance(textToSpeak);
    

    // ✅ Start recording only after speech is finished
    utterance.onend = () => {
      console.log("Speech has finished.");
      startRecording();
    };

    // Optional: log any speech errors
    utterance.onerror = (e) => {
      console.error("Speech error:", e);
      startRecording(); // fallback
    };

    speechSynthesis.speak(utterance);
    console.log(`currentQuestion after~ ${JSON.stringify(currentQuestion)}`);

    // if(isCorrect){

    //   setCurrentQuestionIndex(currentQuestionIndex+1);
    // }
  };


  const repeatQuestion = () => {
    readQuestion()
  }

  const handleAnswer = (answer: string) => {
    
    const currentQuestion = questions[currentQuestionIndex]
    const correct = answer === currentQuestion.correctAnswer
    setIsCorrect(correct)
    setGameState("feedback")

    if (correct) {
      setScore(score + 1)
      speak("Correct! Great job!")
      playCorrectSound()

      autoProgressTimerRef.current = setTimeout(() => {
        nextQuestion()
      }, 3000)
    } else {
      speak("Not quite right, but good try!")
      playIncorrectSound()

      autoProgressTimerRef.current = setTimeout(() => {
        nextQuestion()
      }, 4000)
    }

    setTimeout(() => {
      speak(currentQuestion.explanation)
    }, 2000)
  }

  const nextQuestion = () => {
    if (autoProgressTimerRef.current) {
      clearTimeout(autoProgressTimerRef.current)
      autoProgressTimerRef.current = null
    }

    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1)
      setGameState("playing")
      setIsCorrect(null)
      setLastHeardCommand("")
      setTimeout(() => {
        readQuestion()
      }, 500)
    } else {
      setGameState("complete")
      speak(
        `Game complete! You got ${score + (isCorrect ? 1 : 0)} out of ${questions.length} questions correct. Great job!`,
      )
    }
  }

  const playCorrectSound = () => {
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
      const oscillator = audioContext.createOscillator()
      const gainNode = audioContext.createGain()

      oscillator.connect(gainNode)
      gainNode.connect(audioContext.destination)

      oscillator.frequency.setValueAtTime(523.25, audioContext.currentTime)
      oscillator.frequency.setValueAtTime(659.25, audioContext.currentTime + 0.1)
      oscillator.frequency.setValueAtTime(783.99, audioContext.currentTime + 0.2)

      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime)
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3)

      oscillator.start(audioContext.currentTime)
      oscillator.stop(audioContext.currentTime + 0.3)
    } catch (error) {
      console.error("Error playing correct sound:", error)
    }
  }

  const playIncorrectSound = () => {
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
      const oscillator = audioContext.createOscillator()
      const gainNode = audioContext.createGain()

      oscillator.connect(gainNode)
      gainNode.connect(audioContext.destination)

      oscillator.frequency.setValueAtTime(220, audioContext.currentTime)
      oscillator.frequency.setValueAtTime(196, audioContext.currentTime + 0.15)

      gainNode.gain.setValueAtTime(0.2, audioContext.currentTime)
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3)

      oscillator.start(audioContext.currentTime)
      oscillator.stop(audioContext.currentTime + 0.3)
    } catch (error) {
      console.error("Error playing incorrect sound:", error)
    }
  }

  const resetGame = () => {
    cleanupResources()
    setGameState("start")
    setCurrentQuestionIndex(0)
    setScore(0)
    setIsCorrect(null)
    setLastHeardCommand("")
    setIsRecording(false)
    setRecordingTimeLeft(0)
  }

  const currentQuestion = questions[currentQuestionIndex]
  const progressPercentage = Math.round(((currentQuestionIndex + 1) / questions.length) * 100)

  const VoiceVisualizer = () => {
    const bars = 5
    return (
      <div className="flex items-center justify-center space-x-1 h-16">
        {[...Array(bars)].map((_, i) => {
          const height = isRecording
            ? `${20 + (voiceAmplitude * 30) + (Math.sin(Date.now() / 200 + i) * 10)}px`
            : '8px'
          return (
            <div
              key={i}
              className="w-2 bg-purple-400 rounded-full transition-all duration-150"
              style={{ height }}
            />
          )
        })}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <header className="bg-gray-800 border-b border-gray-700">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-white rounded flex items-center justify-center">
                <span className="text-gray-900 font-bold text-lg">🎓</span>
              </div>
              <span className="text-xl font-bold">EduPlay</span>
            </div>

            <nav className="hidden md:flex items-center space-x-8">
              <a href="#" className="text-gray-300 hover:text-white transition-colors text-lg">
                Home
              </a>
              <a href="#" className="text-gray-300 hover:text-white transition-colors text-lg">
                Games
              </a>
              <a href="#" className="text-gray-300 hover:text-white transition-colors text-lg">
                About
              </a>
            </nav>

            <div className="flex items-center space-x-4">
              <Button variant="ghost" size="sm" className="text-gray-300 hover:text-white">
                <Settings className="w-5 h-5" />
              </Button>
              <div className="w-10 h-10 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full flex items-center justify-center">
                <User className="w-6 h-6 text-white" />
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-12 max-w-4xl">
        {gameState === "start" && (
          <div className="text-center space-y-8">
            <h1 className="text-5xl md:text-6xl font-bold mb-6">Welcome to the Auto-Voice Quiz!</h1>
            <p className="text-xl md:text-2xl text-gray-300 mb-12 max-w-3xl mx-auto leading-relaxed">
              Get ready for an interactive quiz experience! The game will automatically listen for your answers after each question.
            </p>
            <div className="space-y-4">
              <Button
                onClick={startGame}
                className="bg-purple-600 hover:bg-purple-700 text-white text-2xl px-12 py-6 rounded-lg font-semibold"
              >
                Start Auto-Voice Game
              </Button>
              <div className="text-gray-400">
                <p className="flex items-center justify-center gap-2">
                  <Volume2 className="w-5 h-5" />
                  Voice input will activate automatically after each question
                </p>
              </div>
            </div>
          </div>
        )}

        {(gameState === "playing" || gameState === "feedback") && (
          <div className="space-y-8">
            <div className="flex items-center justify-between mb-8">
              <span className="text-xl font-semibold">Progress</span>
              <span className="text-xl font-semibold">{progressPercentage}%</span>
            </div>
            <div className="w-full bg-gray-700 rounded-full h-3 mb-8">
              <div
                className="bg-white rounded-full h-3 transition-all duration-500"
                style={{ width: `${progressPercentage}%` }}
              />
            </div>

            <div className="text-center mb-6">
              {isRecording && (
                <div className="space-y-4">
                  <div className="text-2xl font-bold text-purple-400">
                    🎤 Listening... ({recordingTimeLeft}s)
                  </div>
                  <VoiceVisualizer />
                </div>
              )}
              {isProcessing && (
                <div className="text-xl text-yellow-400">
                  🤖 Processing with Gemini AI...
                </div>
              )}
            </div>

            {lastHeardCommand && (
              <div className="text-center mb-6">
                <p className="text-lg text-gray-300">You said: "{lastHeardCommand}"</p>
              </div>
            )}

            <div className="text-center mb-8">
              <h2 className="text-2xl md:text-3xl font-semibold mb-8">Question: {currentQuestion.question}</h2>
            </div>

            <div className="space-y-4 max-w-2xl mx-auto">
              {currentQuestion.type === "yesno" ? (
                <>
                  <Button
                    onClick={() => handleAnswer("yes")}
                    className="w-full bg-gray-700 hover:bg-gray-600 text-white text-xl py-6 rounded-lg font-semibold"
                    disabled={gameState === "feedback"}
                  >
                    A. Yes
                  </Button>
                  <Button
                    onClick={() => handleAnswer("no")}
                    className="w-full bg-gray-700 hover:bg-gray-600 text-white text-xl py-6 rounded-lg font-semibold"
                    disabled={gameState === "feedback"}
                  >
                    B. No
                  </Button>
                </>
              ) : (
                currentQuestion.options?.map((option, index) => (
                  <Button
                    key={index}
                    onClick={() => handleAnswer(option.toLowerCase())}
                    className="w-full bg-gray-700 hover:bg-gray-600 text-white text-xl py-6 rounded-lg font-semibold text-left"
                    disabled={gameState === "feedback"}
                  >
                    {String.fromCharCode(65 + index)}. {option}
                  </Button>
                ))
              )}
            </div>

            {gameState === "feedback" && (
              <div className="text-center mt-8 space-y-4">
                <div className={`text-2xl font-bold ${isCorrect ? "text-green-400" : "text-orange-400"}`}>
                  {isCorrect ? "Correct! 🎉" : "Good Try! 💪"}
                </div>
                <p className="text-xl text-gray-300">{currentQuestion.explanation}</p>
                <div className="text-gray-400">
                  {isCorrect ? "Moving to next question..." : "Don't worry, moving on..."}
                </div>
              </div>
            )}

            {gameState === "playing" && !isRecording && !isProcessing && (
              <div className="flex justify-center gap-4 mt-8">
                <Button
                  onClick={repeatQuestion}
                  variant="secondary"
                  className="bg-gray-700 hover:bg-gray-600 text-white text-lg px-6 py-3 rounded-lg"
                >
                  Repeat Question
                </Button>
                <Button
                  onClick={startRecording}
                  className="bg-purple-600 hover:bg-purple-700 text-white text-lg px-6 py-3 rounded-lg"
                >
                  Manual Voice Input
                </Button>
              </div>
            )}
          </div>
        )}

        {gameState === "complete" && (
          <div className="text-center space-y-8">
            <h2 className="text-5xl font-bold text-purple-400 mb-6">Game Complete! 🏆</h2>
            <div className="text-3xl font-bold mb-4">
              Final Score: {score} out of {questions.length}
            </div>
            <div className="text-xl text-gray-300 mb-8">
              {score === questions.length
                ? "Perfect! Amazing job! 🌟"
                : score >= questions.length * 0.8
                  ? "Excellent work! 🎯"
                  : score >= questions.length * 0.6
                    ? "Good job! Keep practicing! 👍"
                    : "Nice try! You'll do better next time! 💪"}
            </div>
            <Button
              onClick={resetGame}
              className="bg-purple-600 hover:bg-purple-700 text-white text-2xl px-12 py-6 rounded-lg font-semibold"
            >
              Play Again
            </Button>
          </div>
        )}
      </main>
    </div>
  )
}