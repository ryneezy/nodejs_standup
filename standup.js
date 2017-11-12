const Schedule = require('node-schedule')
const Slack = require('@slack/client')
const WebClient = Slack.WebClient
const RtmClient = Slack.RtmClient
const RTM_EVENTS = Slack.RTM_EVENTS
const MemoryDataStore = Slack.MemoryDataStore
const Winston = require('winston')

Winston.loggers.add('logger', {
  file: {
    filename: './standup.log',
    level: 'info'
  }
})

const logger = Winston.loggers.get('logger')

const config = require('./config.js')
const token = process.env.SLACK_API_TOKEN || ''

// Slack clients
const slackWeb = new WebClient(token)
const slackRtm = new RtmClient(token, {
  dataStore: new MemoryDataStore()
})

// Hash that maps each team member's status to a Direct Message ID
const userToDM = {}

// Hash that maps a Direct Message ID to a standup status
const dmToStatus = {}

function clearHash(hash) {
  for (var k in hash) delete hash[k]
}

/**
 * Sends a question to a user
 * @to_user {string} The question to send
 * @question {hash} a question with keys color and question
 * @fn {function} callback function
 */
function sendQuestion(to_user, question, fn) {
  logger.info(`Sending question ${question.question} to ${to_user}`)
  slackWeb.chat.postMessage(`@${to_user}`, '', {
    as_user: true,
    attachments: [
      {
        color: question.color,
        text: question.question
      }
    ]
  }, (err, res) => fn(err, res))
}

/**
 * Resets team member's standup answers and begins a new standup
 */
function standup() {
  logger.info("Starting standup...")
  const datum = [userToDM, dmToStatus]
  datum.forEach(d => clearHash(d))

  const q = config.standupQuestions[0]
  config.teamMembers.forEach(person => {
    sendQuestion(person, q, (err, res) => {
      if (err) {
        logger.error(err)
        return
      }
      const channel = res.channel
      userToDM[person] = channel
      dmToStatus[channel] = []
    })
  })
}

/**
 * Posts a user's stand up status to the team channel
 * @param user {string} team member's username
 */
function postStatusToTeam(user) {
  const dmId = userToDM[user]
  const status = dmToStatus[dmId]

  slackWeb.chat.postMessage(config.teamChannel, `*${user}'s* standup status is`, {
    as_user: false,
    as_user: user,
    attachments: status.map(s => {
      return {
        color: s.color,
        title: s.question,
        text: s.answer
      }
    })
  }, (err, res) => {
    if (err) {
      logger.error(err)
    }
  })
}

/**
 * Processes a team members response. It will determine what question was answered
 * and update the user's answers. It will either send the next question or
 * post the team member's stanup status to their team channel.
 *
 * NOTE: Since Slack is Async the responses there is a possiblity the answers
 * will not correlate to the question, but for the most part this should work.
 * Hopefully your daily standup is not mission critical ¯\_(ツ)_/¯
 *
 * @message {hash} Slack's message hash.
 * @see https://api.slack.com/events/message
 */
function processMessage(message) {
  const user = slackRtm.dataStore.getUserById(message.user).name
  if (config.teamMembers.indexOf(user) >= 0) {
    const dmId = userToDM[user]
    const answers = dmToStatus[dmId]
    if (answers.length == config.standupQuestions.length) {
      logger.info(`User ${user} already answered all stand up questions. Bailing`)
      return;
    }

    const question = config.standupQuestions[answers.length]
    const answer = message.text
    logger.info(`Received answer ${answer} from ${user} for question ${question.question}`)
    answers.push({
      question: question.question,
      color: question.color,
      answer: answer
    })

    const nextQuestionIndex = answers.length
    if (nextQuestionIndex >= config.standupQuestions.length) {
      logger.info(`${user} completed stand up questions. Posting answers to team`)
      postStatusToTeam(user)
      return
    }

    sendQuestion(user, config.standupQuestions[nextQuestionIndex], (err, res) => {
      if (err) {
        logger.error(err)
        return
      }
      // Don't do anything for result, we'll get another callback here.
    })
  }
}

// Connect to Slack's Real Time Messaging API and register to Message Events
// with the processMessge function
slackRtm.start()
slackRtm.on(RTM_EVENTS.MESSAGE, (message) => processMessage(message))

// Schedule standup
Schedule.scheduleJob(config.standupSchedule, () => standup())
