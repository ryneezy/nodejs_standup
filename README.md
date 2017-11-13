## nodejs_standup

A simple Node.js for scheduling daily stand up through Slack.

#### How to install
1. Create a bot user for your organization and set the Token in an environment
variable named `SLACK_API_TOKEN`
1. Run `npm install` from a terminal

#### Configuration
Open the `config.js` file and edit the configuration with your daily standup
schedule, your team's channel, your team members, and the questions you want
to ask.

#### Running
Once you have your `SLACK_API_TOKEN` in an environment variable and updated
`config.js`, simply run `npm run standup`

Arguably, you probably want to set this up as a daemon somewhere instead of
hosting it on your laptop so daily standup is not interrupted if you close
your laptop lid or spill coffee on your keyboard :stuck_out_tongue_winking_eye:
