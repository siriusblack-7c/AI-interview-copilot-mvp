import InterviewDashboard from './components/InterviewDashboard'
import InterviewProvider from './providers/InterviewProvider'

function App() {
  return (
    <InterviewProvider>
      <InterviewDashboard />
    </InterviewProvider>
  )
}

export default App
