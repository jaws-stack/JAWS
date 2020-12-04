'use strict';

const expect = require('chai').expect;
const runServerless = require('../../../../../../utils/run-serverless');

describe('lib/plugins/aws/package/lib/mergeIamTemplates.test.js', () => {
  describe('No default role', () => {
    it('should not create role resource if there are no functions', async () => {
      const { cfTemplate, awsNaming } = await runServerless({
        fixture: 'aws',
        cliArgs: ['package'],
      });
      const iamRoleLambdaExecution = awsNaming.getRoleLogicalId();
      const resourceIam = cfTemplate.Resources[iamRoleLambdaExecution];
      expect(resourceIam).to.be.undefined;
    });

    it('should not create role resource with `provider.role`', async () => {
      const { cfTemplate, awsNaming } = await runServerless({
        fixture: 'function',
        cliArgs: ['package'],
        configExt: {
          provider: {
            name: 'aws',
            role: 'arn:aws:iam::YourAccountNumber:role/YourIamRole',
          },
        },
      });

      const IamRoleLambdaExecution = awsNaming.getRoleLogicalId();
      expect(cfTemplate.Resources).to.not.have.property(IamRoleLambdaExecution);
    });

    it('should not create role resource with all functions having `functions[].role`', async () => {
      const { cfTemplate, awsNaming } = await runServerless({
        fixture: 'function',
        cliArgs: ['package'],
        configExt: {
          service: 'another-service',
          functions: {
            foo: {
              handler: 'index.handler',
              role: 'some:aws:arn:xx1:*:*',
            },
            other: {
              handler: 'index.handler',
              role: 'some:aws:arn:xx1:*:*',
            },
          },
        },
      });

      const IamRoleLambdaExecution = awsNaming.getRoleLogicalId();
      expect(cfTemplate.Resources).to.not.have.property(IamRoleLambdaExecution);
    });
  });

  describe('Default role', () => {
    describe('Defaults', () => {
      let naming;
      let cfResources;

      before(async () => {
        const { cfTemplate, awsNaming } = await runServerless({
          fixture: 'function',
          cliArgs: ['package'],
          configExt: {
            service: 'another-service',
            functions: {
              myFunction: {
                handler: 'index.handler',
              },
              myFunctionWithRole: {
                name: 'myCustomName',
                handler: 'index.handler',
                role: 'myCustRole0',
              },
            },
          },
        });
        cfResources = cfTemplate.Resources;
        naming = awsNaming;
      });

      it('should not configure ManagedPolicyArns by default', () => {
        const IamRoleLambdaExecution = naming.getRoleLogicalId();
        const { Properties } = cfResources[IamRoleLambdaExecution];
        expect(Properties.ManagedPolicyArns).to.be.undefined;
      });

      it('should add logGroup access policies if there are functions', () => {
        const IamRoleLambdaExecution = naming.getRoleLogicalId();
        const { Properties } = cfResources[IamRoleLambdaExecution];

        const createLogStatement = Properties.Policies[0].PolicyDocument.Statement[0];
        expect(createLogStatement.Effect).to.be.equal('Allow');
        expect(createLogStatement.Action).to.be.deep.equal([
          'logs:CreateLogStream',
          'logs:CreateLogGroup',
        ]);
        expect(createLogStatement.Resource).to.deep.includes({
          'Fn::Sub':
            'arn:${AWS::Partition}:logs:${AWS::Region}:${AWS::AccountId}:log-group:/aws/lambda/another-service-dev*:*',
        });

        const putLogStatement = Properties.Policies[0].PolicyDocument.Statement[1];
        expect(putLogStatement.Effect).to.be.equal('Allow');
        expect(putLogStatement.Action).to.be.deep.equal(['logs:PutLogEvents']);
        expect(putLogStatement.Resource).to.deep.includes({
          'Fn::Sub':
            'arn:${AWS::Partition}:logs:${AWS::Region}:${AWS::AccountId}:log-group:/aws/lambda/another-service-dev*:*:*',
        });
      });

      it('should add logGroup access policies for custom named functions', () => {
        const IamRoleLambdaExecution = naming.getRoleLogicalId();
        const { Properties } = cfResources[IamRoleLambdaExecution];

        const createLogStatement = Properties.Policies[0].PolicyDocument.Statement[0];
        expect(createLogStatement.Effect).to.be.equal('Allow');
        expect(createLogStatement.Action).to.be.deep.equal([
          'logs:CreateLogStream',
          'logs:CreateLogGroup',
        ]);
        expect(createLogStatement.Resource).to.deep.includes({
          'Fn::Sub':
            'arn:${AWS::Partition}:logs:${AWS::Region}:${AWS::AccountId}:log-group:/aws/lambda/myCustomName:*',
        });

        const putLogStatement = Properties.Policies[0].PolicyDocument.Statement[1];
        expect(putLogStatement.Effect).to.be.equal('Allow');
        expect(putLogStatement.Action).to.be.deep.equal(['logs:PutLogEvents']);
        expect(putLogStatement.Resource).to.deep.includes({
          'Fn::Sub':
            'arn:${AWS::Partition}:logs:${AWS::Region}:${AWS::AccountId}:log-group:/aws/lambda/myCustomName:*:*',
        });
      });

      it('should configure LogGroup resources for functions', () => {
        const myFunctionWithRole = naming.getLogGroupLogicalId('myFunctionWithRole');
        const myCustomName = cfResources[myFunctionWithRole];

        expect(myCustomName.Type).to.be.equal('AWS::Logs::LogGroup');
        expect(myCustomName.Properties.LogGroupName).to.be.equal('/aws/lambda/myCustomName');

        const myFunctionName = naming.getLogGroupLogicalId('myFunction');
        const myFunctionResource = cfResources[myFunctionName];

        expect(myFunctionResource.Type).to.be.equal('AWS::Logs::LogGroup');
        expect(myFunctionResource.Properties.LogGroupName).to.be.equal(
          '/aws/lambda/another-service-dev-myFunction'
        );
      });
    });

    describe('Provider properties', () => {
      let cfResources;
      let naming;

      before(async () => {
        const { cfTemplate, awsNaming } = await runServerless({
          fixture: 'function',
          cliArgs: ['package'],
          configExt: {
            service: 'my-service',
            provider: {
              iamRoleStatements: [
                {
                  Effect: 'Allow',
                  Resource: '*',
                  NotAction: 'iam:DeleteUser',
                },
              ],
              vpc: {
                securityGroupIds: ['xxx'],
                subnetIds: ['xxx'],
              },
              logRetentionInDays: 5,
              iamManagedPolicies: [
                'arn:aws:iam::123456789012:user/*',
                'arn:aws:s3:::my_corporate_bucket/Development/*',
                'arn:aws:iam::123456789012:u*',
              ],
              rolePermissionsBoundary: ['arn:aws:iam::123456789012:policy/XCompanyBoundaries'],
            },
          },
        });

        cfResources = cfTemplate.Resources;
        naming = awsNaming;
      });

      it('should support `provider.iamRoleStatements`', async () => {
        const IamRoleLambdaExecution = naming.getRoleLogicalId();
        const iamResource = cfResources[IamRoleLambdaExecution];
        const { Statement } = iamResource.Properties.Policies[0].PolicyDocument;

        expect(Statement).to.deep.includes({
          Effect: 'Allow',
          Resource: '*',
          NotAction: ['iam:DeleteUser'],
        });
      });
      it('should support `provider.iamManagedPolicies`', () => {
        const IamRoleLambdaExecution = naming.getRoleLogicalId();
        const {
          Properties: { ManagedPolicyArns },
        } = cfResources[IamRoleLambdaExecution];

        expect(ManagedPolicyArns).to.deep.includes('arn:aws:iam::123456789012:user/*');
        expect(ManagedPolicyArns).to.deep.includes(
          'arn:aws:s3:::my_corporate_bucket/Development/*'
        );
        expect(ManagedPolicyArns).to.deep.includes('arn:aws:iam::123456789012:u*');
      });

      it('should support `provider.rolePermissionsBoundary`', () => {
        const IamRoleLambdaExecution = naming.getRoleLogicalId();
        const {
          Properties: { PermissionsBoundary },
        } = cfResources[IamRoleLambdaExecution];
        expect(PermissionsBoundary).to.be.equal(
          'arn:aws:iam::123456789012:policy/XCompanyBoundaries'
        );
      });

      it('should ensure needed IAM configuration when `provider.vpc` is configured', () => {
        const IamRoleLambdaExecution = naming.getRoleLogicalId();
        const iamResource = cfResources[IamRoleLambdaExecution];

        expect(iamResource.Properties.ManagedPolicyArns).to.deep.includes({
          'Fn::Join': [
            '',
            [
              'arn:',
              { Ref: 'AWS::Partition' },
              ':iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole',
            ],
          ],
        });
      });

      it('should support `provider.logRetentionInDays`', () => {
        const normalizedName = naming.getLogGroupLogicalId('foo');
        const iamResource = cfResources[normalizedName];
        expect(iamResource.Type).to.be.equal('AWS::Logs::LogGroup');
        expect(iamResource.Properties.RetentionInDays).to.be.equal(5);
        expect(iamResource.Properties.LogGroupName).to.be.equal('/aws/lambda/my-service-dev-foo');
      });
    });

    describe('Function properties', () => {
      let cfResources;
      let naming;
      let serverless;
      const customFunctionName = 'foo-bar';
      before(async () => {
        const { awsNaming, cfTemplate, serverless: serverlessInstance } = await runServerless({
          fixture: 'function',
          cliArgs: ['package'],
          configExt: {
            functions: {
              fnDisableLogs: {
                handler: 'index.handler',
                disableLogs: true,
              },
              fnWithVpc: {
                handler: 'func.function.handler',
                name: 'new-service-dev-func1',
                vpc: {
                  securityGroupIds: ['xxx'],
                  subnetIds: ['xxx'],
                },
              },
              fnHaveCustomName: {
                name: customFunctionName,
                handler: 'index.handler',
                disableLogs: true,
              },
            },
          },
        });
        cfResources = cfTemplate.Resources;
        naming = awsNaming;
        serverless = serverlessInstance;
      });

      it('should ensure needed IAM configuration when `functions[].vpc` is configured', () => {
        const IamRoleLambdaExecution = naming.getRoleLogicalId();
        const { Properties } = cfResources[IamRoleLambdaExecution];
        expect(Properties.ManagedPolicyArns).to.deep.includes({
          'Fn::Join': [
            '',
            [
              'arn:',
              { Ref: 'AWS::Partition' },
              ':iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole',
            ],
          ],
        });
      });

      it('should support `functions[].disableLogs`', async () => {
        const functionName = serverless.service.getFunction('fnDisableLogs').name;
        const functionLogGroupName = naming.getLogGroupName(functionName);

        expect(cfResources).to.not.have.property(functionLogGroupName);
      });

      it('should not have allow rights to put logs for custom named function when disableLogs option is enabled', async () => {
        expect(
          cfResources[naming.getRoleLogicalId()].Properties.Policies[0].PolicyDocument.Statement[0]
            .Resource
        ).to.not.deep.include({
          'Fn::Sub':
            'arn:${AWS::Partition}:logs:${AWS::Region}:${AWS::AccountId}:' +
            `log-group:/aws/lambda/${customFunctionName}:*`,
        });
        expect(
          cfResources[naming.getRoleLogicalId()].Properties.Policies[0].PolicyDocument.Statement[1]
            .Resource
        ).to.not.deep.include({
          'Fn::Sub':
            'arn:${AWS::Partition}:logs:${AWS::Region}:${AWS::AccountId}:' +
            `log-group:/aws/lambda/${customFunctionName}:*`,
        });
      });

      it('should have deny policy when disableLogs option is enabled`', async () => {
        const functionName = serverless.service.getFunction('fnDisableLogs').name;
        const functionLogGroupName = naming.getLogGroupName(functionName);

        expect(
          cfResources[naming.getRoleLogicalId()].Properties.Policies[0].PolicyDocument.Statement
        ).to.deep.include({
          Effect: 'Deny',
          Action: 'logs:PutLogEvents',
          Resource: [
            {
              'Fn::Sub':
                'arn:${AWS::Partition}:logs:${AWS::Region}:${AWS::AccountId}' +
                `:log-group:${functionLogGroupName}:*`,
            },
          ],
        });
      });
    });
  });
});
