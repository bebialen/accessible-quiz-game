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
  const currentQuestionRef = useRef<Question | null>(null)
  const currentQuestionIndexRef = useRef<number>(0)
  const gameStateRef = useRef<string>("start")

  const GEMINI_API_KEY = process.env.GEMINI_API_KEY 

  useEffect(() => {
    if ("speechSynthesis" in window) {
      synthRef.current = window.speechSynthesis
    }

    return () => {
      cleanupResources()
    }
  }, [])

  // Sync refs with state
  useEffect(() => {
    currentQuestionIndexRef.current = currentQuestionIndex
    currentQuestionRef.current = questions[currentQuestionIndex]
  }, [currentQuestionIndex])

  useEffect(() => {
    gameStateRef.current = gameState
  }, [gameState])

  const cleanupResources = () => {
    if (recordingTimerRef.current) {
      clearTimeout(recordingTimerRef.current)
      recordingTimerRef.current = null
    }
    if (autoProgressTimerRef.current) {
      clearTimeout(autoProgressTimerRef.current)
      autoProgressTimerRef.current = null
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop()
    }

    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(console.error)
    }

    if (synthRef.current) {
      synthRef.current.cancel()
    }
  }

  const speak = (text: string, rate = 0.8, onEnd?: () => void) => {
    if (synthRef.current) {
      synthRef.current.cancel()
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.rate = rate
      utterance.pitch = 1.1
      utterance.volume = 0.8

      if (onEnd) {
        utterance.onend = onEnd
      }

      utterance.onerror = (e) => {
        console.error('Speech error:', e)
        if (onEnd) onEnd()
      }

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
          setVoiceAmplitude(Math.min(average / 128, 2))
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
      console.log('Starting recording...')

      // Cleanup any existing recording
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        console.log('Stopping existing recording')
        mediaRecorderRef.current.stop()
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mediaRecorderRef.current = new MediaRecorder(stream)
      audioChunksRef.current = []

      setupAudioAnalyser(stream)

      mediaRecorderRef.current.ondataavailable = (event) => {
        console.log('Audio data available:', event.data.size)
        audioChunksRef.current.push(event.data)
      }

      mediaRecorderRef.current.onstop = async () => {
        console.log('Recording stopped, processing audio...')
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' })
        console.log('Audio blob size:', audioBlob.size)

        // Clean up stream
        stream.getTracks().forEach(track => track.stop())

        if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
          audioContextRef.current.close().catch(console.error)
          audioContextRef.current = null
        }

        setVoiceAmplitude(0)

        // Process audio with Gemini
        await processAudioWithGemini(audioBlob)
      }

      mediaRecorderRef.current.start()
      setIsRecording(true)
      setRecordingTimeLeft(10)
      playRecordingStartSound()

      // Clear any existing timer
      if (recordingTimerRef.current) {
        clearTimeout(recordingTimerRef.current)
      }

      const timer = setInterval(() => {
        setRecordingTimeLeft(prev => {
          if (prev <= 1) {
            clearInterval(timer)
            console.log('Recording timer finished, stopping recording')
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
      setIsRecording(false)
    }
  }

  const stopRecording = () => {
    console.log('Stop recording called')

    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      console.log('Actually stopping recording...')
      mediaRecorderRef.current.stop()
    }

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

  const processAudioWithGemini = async (audioBlob: Blob) => {
    console.log('Processing audio with Gemini...')
    setIsProcessing(true)

    try {
      if (audioBlob.size === 0) {
        console.error('Audio blob is empty')
        setLastHeardCommand('No audio recorded')
        return
      }

      // Convert blob to base64
      const base64Audio = await blobToBase64(audioBlob)
      console.log('Audio converted to base64, length:', base64Audio.length)

      const currentQuestion = currentQuestionRef.current
      if (!currentQuestion) {
        console.error('No current question available')
        return
      }

      // Create prompt for Gemini
      let prompt = `You are processing audio from a quiz game. Listen to the audio and determine what the user said.

Current Question: "${currentQuestion.question}"
Question Type: ${currentQuestion.type}

`

      if (currentQuestion.type === "yesno") {
        prompt += `The user should answer "yes" or "no". Listen for variations like "yeah", "yep", "nope", etc.
Return ONLY one of: "yes" or "no"`
      } else if (currentQuestion.type === "multiple" && currentQuestion.options) {
        prompt += `The user should choose from these options:
${currentQuestion.options.map((opt, idx) => `${String.fromCharCode(65 + idx)}. ${opt}`).join('\n')}

The user might say the letter (A, B, C) or the actual option name.
Return ONLY the option text in lowercase (like "${currentQuestion.options[0].toLowerCase()}" or "${currentQuestion.options[1]?.toLowerCase() || ''}")

Available options: ${currentQuestion.options.map(opt => opt.toLowerCase()).join(', ')}`
      }

      prompt += `

If the audio is unclear or you can't determine the answer, return "unclear".
If the user says "repeat" or "again", return "repeat".

Return only the parsed answer, nothing else.`

      console.log('Sending request to Gemini API...')

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: prompt },
              {
                inline_data: {
                  mime_type: "audio/wav",
                  data: base64Audio
                }
              }
            ]
          }]
        })
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error(`Gemini API error: ${response.status}`, errorText)
        throw new Error(`Gemini API error: ${response.status}`)
      }

      const data = await response.json()
      const geminiResponse = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim().toLowerCase()

      console.log('Gemini response:', geminiResponse)
      setLastHeardCommand(geminiResponse || 'No response')

      if (geminiResponse) {
        handleVoiceCommand(geminiResponse)
      } else {
        console.log('No valid response from Gemini')
        // Allow user to try again after a short delay
        setTimeout(() => {
          if (gameStateRef.current === "playing") {
            console.log('Restarting recording after no response')
            startRecording()
          }
        }, 2000)
      }

    } catch (error) {
      console.error('Error processing audio with Gemini:', error)
      setLastHeardCommand('Error processing audio')

      // Allow user to try again after error
      setTimeout(() => {
        if (gameStateRef.current === "playing") {
          console.log('Restarting recording after error')
          startRecording()
        }
      }, 2000)
    } finally {
      setIsProcessing(false)
    }
  }

  const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onloadend = () => {
        const base64String = reader.result as string
        const base64Data = base64String.split(',')[1]
        resolve(base64Data)
      }
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
  }

  const handleVoiceCommand = (command: string) => {
    console.log('Handling voice command:', command)
    const currentQuestion = currentQuestionRef.current

    if (!currentQuestion) {
      console.error('No current question for voice command')
      return
    }

    if (gameStateRef.current === "start") {
      if (command.includes("start") || command.includes("play") || command.includes("begin")) {
        startGame()
      }
      return
    }

    if (gameStateRef.current === "playing") {
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

        // Check for option names first
        const matchedOption = options.find(opt => command.includes(opt))
        if (matchedOption) {
          handleAnswer(matchedOption)
          answered = true
        }
        // Check for letter choices
        else if (command.includes("a") && options[0]) {
          handleAnswer(options[0])
          answered = true
        } else if (command.includes("b") && options[1]) {
          handleAnswer(options[1])
          answered = true
        } else if (command.includes("c") && options[2]) {
          handleAnswer(options[2])
          answered = true
        }
      }

      if (!answered && command !== "unclear") {
        console.log('Command not recognized, restarting recording')
        setTimeout(() => {
          if (gameStateRef.current === "playing") {
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
    console.log('Starting game...')
    setGameState("playing")
    setCurrentQuestionIndex(0)
    setScore(0)
    setIsCorrect(null)
    setTimeout(() => {
      readQuestion()
    }, 500)
  }

  const readQuestion = () => {
    const questionIndex = currentQuestionIndexRef.current
    const currentQuestion = questions[questionIndex]

    console.log('Reading question:', questionIndex)

    const progressText = `Question ${questionIndex + 1} of ${questions.length}.`
    let textToSpeak = `${progressText} ${currentQuestion.question}`

    if (currentQuestion.type === 'multiple' && currentQuestion.options) {
      const optionsText = currentQuestion.options.map((opt, i) => `${String.fromCharCode(65 + i)}. ${opt}`).join('. ')
      textToSpeak += ` Your options are: ${optionsText}`
    }

    speak(textToSpeak, 0.9, () => {
      console.log('Question reading finished, starting recording...')
      // Ensure we are still in the playing state before starting to record
      if (gameStateRef.current === "playing") {
        setTimeout(() => {
          startRecording()
        }, 500) // Small delay to ensure speech has fully ended
      }
    })
  }

  const repeatQuestion = () => {
    console.log('Repeating question...')
    readQuestion()
  }

  const handleAnswer = (answer: string) => {
    console.log('Handling answer:', answer)
    const currentQuestion = currentQuestionRef.current
    if (!currentQuestion) return

    const correct = answer === currentQuestion.correctAnswer
    setIsCorrect(correct)
    setGameState("feedback")

    if (correct) {
      setScore(prevScore => prevScore + 1)
    }

    // Speak feedback after a short delay
    setTimeout(() => {
      if (correct) {
        speak("Correct! Great job!", 0.8, () => {
          speak(currentQuestion.explanation, 0.8, () => {
            autoProgressTimerRef.current = setTimeout(() => {
              nextQuestion()
            }, 1000)
          })
        })
        playCorrectSound()
      } else {
        speak("Not quite right, but good try!", 0.8, () => {
          speak(currentQuestion.explanation, 0.8, () => {
            autoProgressTimerRef.current = setTimeout(() => {
              nextQuestion()
            }, 1000)
          })
        })
        playIncorrectSound()
      }
    }, 500)
  }

  const nextQuestion = () => {
    const currentIndex = currentQuestionIndexRef.current
    console.log('Moving to next question from:', currentIndex)

    if (autoProgressTimerRef.current) {
      clearTimeout(autoProgressTimerRef.current)
      autoProgressTimerRef.current = null
    }

    if (currentIndex < questions.length - 1) {
      const newIndex = currentIndex + 1
      setCurrentQuestionIndex(newIndex)
      setGameState("playing")
      setIsCorrect(null)
      setLastHeardCommand("")

      // Small delay to ensure state has updated
      setTimeout(() => {
        readQuestion()
      }, 100)
    } else {
      setGameState("complete")
      speak(
        `Game complete! You got ${score} out of ${questions.length} questions correct. Great job!`
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
    console.log('Resetting game...')
    cleanupResources()
    setGameState("start")
    setCurrentQuestionIndex(0)
    setScore(0)
    setIsCorrect(null)
    setLastHeardCommand("")
    setIsRecording(false)
    setRecordingTimeLeft(0)
    setIsProcessing(false)
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