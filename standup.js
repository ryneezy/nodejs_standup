const Schedule = require('node-schedule')
const Slack = require('@slack/client')
const WebClient = Slack.WebClient
const RtmClient = Slack.RtmClient
const RTM_EVENTS = Slack.RTM_EVENTS
const MemoryDataStore = Slack.MemoryDataStore
const Winston = require('winston')
const dateformat = require('dateformat')

Winston.loggers.add('logger', {
  file: {
    filename: './standup.log',
    level: 'info'
  }
})

const logger = Winston.loggers.get('logger')

const config = require('./config.js')

// Slack clients
const slackWeb = new WebClient(config.slackApiToken)
const slackRtm = new RtmClient(config.slackApiToken, {
  dataStore: new MemoryDataStore()
})

// Hash that maps each team member's status to a Direct Message ID
const userToDM = {}

// Hash that maps a Direct Message ID to a standup status
const dmToAnswers = {}

function clearHash(hash) {
  for (var k in hash) delete hash[k]
}

/**
 * Sends a Direct Message to the user
 * @to_user {String} The question to send
 * @message{String} The message to send
 * @fn {Function} callback function
 */
function sendMessage(to_user, message, fn) {
  logger.debug(`Sending message ${message} to ${to_user}`)
  slackWeb.chat.postMessage(`@${to_user}`, message, { as_user: true }, (err, res) => fn(err, res))
}

function logIfError(err, res) {
  if (err) {
    logger.error(err)
  }
}

function getStandupDate() {
  return dateformat(new Date(), 'yyyy-mm-dd')
}

/**
 * Resets team member's standup answers and begins a new standup
 */
function standup() {
  logger.info("Starting standup...")
  const datum = [userToDM, dmToAnswers]
  datum.forEach(d => clearHash(d))

  if (config.standupQuestions.length == 0) {
    logger.warn("No questions configured for daily standup. Bailing")
    return
  }

  const firstQuestion = config.standupQuestions[0]
  config.teamMembers.forEach(person => {
    // Send a greeting
    const message = `Huzah *${person}*! It's time for *${getStandupDate()}* daily stand up. Please answer the following questions.\n${firstQuestion.question}`
    sendMessage(person, message, (err, res) => {
      if (err) {
        logger.error(err)
        return
      }
      const channel = res.channel
      userToDM[person] = channel
      dmToAnswers[channel] = []
    })
  })
}

/**
 * Posts a user's stand up status to the team channel
 * @param user {String} team member's username
 */
function postStatusToTeam(user) {
  const dmId = userToDM[user]
  const status = dmToAnswers[dmId]

  const u = slackRtm.dataStore.getUserByName(user)
  slackWeb.chat.postMessage(config.teamChannel, `*${u.profile.real_name}* posted status for *${getStandupDate()}* standup:`, {
    as_user: false,
    username: user,
    icon_url: u.profile.image_48,
    attachments: status.map(s => {
      return {
        color: s.color,
        title: s.question,
        text: s.answer
      }
    })
  }, (err, res) => logIfError(err, res))
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
 * @message {Object} Slack's message hash.
 * @see https://api.slack.com/events/message
 */
function processMessage(message) {
  // Only process direct messages and ignore bot_messages
  if (!message.channel.startsWith('D') || message.subtype == 'bot_message') {
    return
  }

  // Subtype means the message could have been edited or deleted.
  // We don't support that yet :(
  if (message.subtype) {
    return
  }

  const user = slackRtm.dataStore.getUserById(message.user).name
  if (config.teamMembers.indexOf(user) < 0) {
    return
  }

  const dmId = userToDM[user]
  if (!(dmId in dmToAnswers)) {
    // Wasn't answering standupBot. Ignore.
    return
  }
  const answers = dmToAnswers[dmId]

  // Already answered all questions.
  if (answers.length == config.standupQuestions.length) {
    logger.info(`User ${user} already answered all stand up questions. Bailing`)
    const message = `You already answered your stand up questions. You can view your status in channel ${config.teamChannel}`
    sendMessage(user, message, (err, res) => logIfError(err, res))
    return
  }

  // Save the answer
  const question = config.standupQuestions[answers.length]
  const answer = message.text
  logger.info(`Received answer ${answer} from ${user} for question ${question.question}`)
  answers.push({
    question: question.question,
    color: question.color,
    answer: answer
  })

  // All answers completed, post to team channel and thank the user
  const nextQuestionIndex = answers.length
  if (nextQuestionIndex >= config.standupQuestions.length) {
    logger.info(`${user} completed stand up questions. Posting answers to team`)
    postStatusToTeam(user)
    const message = `Your stand up status was posted in channel ${config.teamChannel}`
    sendMessage(user, message, (err, res) => logIfError(err, res))
    return
  }

  // Ask the next question
  sendMessage(user, config.standupQuestions[nextQuestionIndex].question, (err, res) => logIfError(err, res))
}

// Connect to Slack's Real Time Messaging API and register to Message Events
// with the processMessge function
slackRtm.start()
slackRtm.on(RTM_EVENTS.MESSAGE, (message) => processMessage(message))

// Schedule standup
Schedule.scheduleJob(config.standupSchedule, () => standup())
