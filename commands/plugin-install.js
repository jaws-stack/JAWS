'use strict';

const spawn = require('child-process-ext/spawn');
const fsp = require('fs').promises;
const fse = require('fs-extra');
const path = require('path');
const _ = require('lodash');
const isPlainObject = require('type/plain-object/is');
const yaml = require('js-yaml');
const cloudformationSchema = require('@serverless/utils/cloudformation-schema');
const log = require('@serverless/utils/log');
const ServerlessError = require('../lib/serverless-error');
const yamlAstParser = require('../lib/utils/yamlAstParser');
const npmCommandDeferred = require('../lib/utils/npm-command-deferred');
const CLI = require('../lib/classes/CLI');
const {
  getPluginInfo,
  getServerlessFilePath,
  validate,
} = require('../lib/commands/plugin-management');

const cli = new CLI(undefined);

module.exports = async ({ configuration, serviceDir, configurationFilename, options }) => {
  validate({ serviceDir });

  const pluginInfo = getPluginInfo(options.name);
  const pluginName = pluginInfo.name;
  const pluginVersion = pluginInfo.version || 'latest';

  const context = { configuration, serviceDir, configurationFilename, pluginName, pluginVersion };
  await pluginInstall(context);
  await addPluginToServerlessFile(context);

  const message = ['Successfully installed', ` "${pluginName}@${pluginVersion}"`].join('');
  cli.log(message);
};

const pluginInstall = async ({ serviceDir, pluginName, pluginVersion }) => {
  const pluginFullName = `${pluginName}@${pluginVersion}`;
  const message = [
    `Installing plugin "${pluginFullName}"`,
    ' (this might take a few seconds...)',
  ].join('');
  cli.log(message);
  await npmInstall(pluginFullName, { serviceDir });
};

const addPluginToServerlessFile = async ({ serviceDir, configurationFilename, pluginName }) => {
  const serverlessFilePath = getServerlessFilePath({ serviceDir, configurationFilename });
  const fileExtension = path.extname(serverlessFilePath);
  if (fileExtension === '.js' || fileExtension === '.ts') {
    requestManualUpdate(serverlessFilePath);
    return;
  }

  const checkIsArrayPluginsObject = (pluginsObject) =>
    pluginsObject == null || Array.isArray(pluginsObject);
  // pluginsObject type determined based on the value loaded during the serverless init.
  if (_.last(serverlessFilePath.split('.')) === 'json') {
    const serverlessFileObj = await fse.readJson(serverlessFilePath);
    const newServerlessFileObj = serverlessFileObj;
    const isArrayPluginsObject = checkIsArrayPluginsObject(newServerlessFileObj.plugins);
    // null modules property is not supported
    let plugins = isArrayPluginsObject
      ? newServerlessFileObj.plugins || []
      : newServerlessFileObj.plugins.modules;

    if (plugins == null) {
      throw new ServerlessError(
        'plugins modules property must be present',
        'PLUGINS_MODULES_MISSING'
      );
    }

    plugins.push(pluginName);
    plugins = _.sortedUniq(plugins);

    if (isArrayPluginsObject) {
      newServerlessFileObj.plugins = plugins;
    } else {
      newServerlessFileObj.plugins.modules = plugins;
    }

    await fse.writeJson(serverlessFilePath, newServerlessFileObj);
    return;
  }

  const serverlessFileObj = yaml.load(await fsp.readFile(serverlessFilePath, 'utf8'), {
    filename: serverlessFilePath,
    schema: cloudformationSchema,
  });
  if (serverlessFileObj.plugins != null) {
    // Plugins section can be behind veriables, opt-out in such case
    if (isPlainObject(serverlessFileObj.plugins)) {
      if (
        serverlessFileObj.plugins.modules != null &&
        !Array.isArray(serverlessFileObj.plugins.modules)
      ) {
        requestManualUpdate(serverlessFilePath);
        return;
      }
    } else if (!Array.isArray(serverlessFileObj.plugins)) {
      requestManualUpdate(serverlessFilePath);
      return;
    }
  }
  await yamlAstParser.addNewArrayItem(
    serverlessFilePath,
    checkIsArrayPluginsObject(serverlessFileObj.plugins) ? 'plugins' : 'plugins.modules',
    pluginName
  );
};

const npmInstall = async (name, { serviceDir }) => {
  const npmCommand = await npmCommandDeferred;
  await spawn(npmCommand, ['install', '--save-dev', name], {
    cwd: serviceDir,
    stdio: 'ignore',
    // To parse quotes used in module versions. E.g. 'serverless@"^1.60.0 || 2"'
    // https://stackoverflow.com/a/48015470
    shell: true,
  });
};

const requestManualUpdate = (serverlessFilePath) =>
  log(`
  Can't automatically add plugin into "${path.basename(serverlessFilePath)}" file.
  Please make it manually.
`);
