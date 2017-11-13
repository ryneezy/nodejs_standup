const config = {}

// Cron entry for daily standup
config.standupSchedule = "0 15 10 * * 1-5"

config.teamChannel = "general"

// List of team members
config.teamMembers = [
  'ryneezy'
]
config.standupQuestions = [
  {
    question: "What did you do yesterday?",
    color: "#f08000"
  },
  {
    question: "What will you do today?",
    color: '#e07ce6'
  },
  {
    question: "Is there anything blocking your progress?",
    color: "#1b5e48"
  }
]

config.slackApiToken= process.env.SLACK_API_TOKEN || ''

module.exports = config
