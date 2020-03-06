'use strict';

module.exports = {
  rules: {
    'body-leading-blank': [2, 'always'],
    'footer-leading-blank': [2, 'always'],
    'header-max-length': [2, 'always', 72],
    'scope-case': [2, 'always', 'start-case'],
    'scope-enum': [
      2,
      'always',
      [
        '',
        'AWS ALB',
        'AWS API Gateway',
        'AWS CloudFormation',
        'AWS Cognito',
        'AWS Deploy',
        'AWS EventBridge',
        'AWS HTTP API',
        'AWS IAM',
        'AWS Kinesis',
        'AWS Lambda',
        'AWS Local Invocation',
        'AWS SNS',
        'AWS Websocket',
        'CLI',
        'Components',
        'Plugins',
        'Standalone',
        'User Config',
        'Variables',
      ],
    ],
    'subject-case': [2, 'always', 'sentence-case'],
    'subject-empty': [2, 'never'],
    'subject-full-stop': [2, 'never', '.'],
    'type-case': [2, 'always', 'lower-case'],
    'type-empty': [2, 'never'],
    'type-enum': [
      2,
      'always',
      ['build', 'chore', 'ci', 'docs', 'feat', 'fix', 'perf', 'refactor', 'style', 'test'],
    ],
  },
};
