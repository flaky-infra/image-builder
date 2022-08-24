import {ConsumeMessage} from 'amqplib';
import {
  ApplicationModel,
  brokerWrapper,
  BrokerWrapper,
  EventTypes,
  FLAKY_DOCKER_REPOSITORY,
  Listener,
  ProjectReadyPublisher,
  ProjectBuildEvent,
} from 'flaky-common';
import {promisify} from 'util';
import nunjucks from 'nunjucks';
import {join} from 'path';
import {writeFileSync} from 'fs';
import {randomUUID} from 'crypto';

const exec = promisify(require('child_process').exec);

export class ProjectBuildListener extends Listener<ProjectBuildEvent> {
  eventType: EventTypes.ProjectBuild = EventTypes.ProjectBuild;
  queueName = `image-builder/project-build-${randomUUID()}`;
  routingKey = this.eventType;

  constructor(broker: BrokerWrapper) {
    super(broker);
    nunjucks.configure(join(__dirname, '..', '..', 'templates'), {
      autoescape: true,
    });
  }

  async onMessage(data: ProjectBuildEvent['data'], msg: ConsumeMessage) {
    const {
      projectId,
      testRunId,
      projectPath,
      name,
      commitId,
      testMethodName,
      configurationFolder,
      buildTool,
      moduleName,
    } = data;
    const project = await ApplicationModel.findById(projectId);
    if (!project) throw new Error('Application not found!');
    try {
      console.log('Buildpack.io generating image...');
      const {stdout: buildpacksStdout, stderr: buildpacksStderr} = await exec(
        `pack build ${name}:${commitId.substring(
          commitId.length - 7
        )}-notr --path ${projectPath} --builder heroku/buildpacks:20 ${
          buildTool === 'gradle' ? '-e GRADLE_TASK="clean build -x test"' : ''
        }`
      );
      project.logStdoutBuildpack = buildpacksStdout;
      project.logStderrBuildpack = buildpacksStderr;
      console.log('Buildpack.io image generated!');
      const dockerfile = nunjucks.render('Dockerfile.njk', {
        imageName: `${name}:${commitId.substring(commitId.length - 7)}-notr`,
      });
      writeFileSync(
        join(projectPath, 'Dockerfile.flakyInfrastructure'),
        dockerfile,
        'utf-8'
      );
      const {stdout: dockerBuildStdout, stderr: dockerBuildStderr} = await exec(
        `docker build -t ${FLAKY_DOCKER_REPOSITORY}/${name}:${commitId.substring(
          commitId.length - 7
        )} -f ${projectPath}/Dockerfile.flakyInfrastructure ${projectPath}`,
        {maxBuffer: 1024 * 1024 * 1024}
      );
      project.logStdoutWrapperImageBuild = dockerBuildStdout;
      project.logStderrWrapperImageBuild = dockerBuildStderr;
      console.log('Wrapper image generated!');

      const {stdout: dockerPushStdout, stderr: dockerPushStderr} = await exec(
        `docker push ${FLAKY_DOCKER_REPOSITORY}/${name}:${commitId.substring(
          commitId.length - 7
        )}`
      );
      project.logStdoutImagePush = dockerPushStdout;
      project.logStderrImagePush = dockerPushStderr;
      console.log('Image pushed to repository!');
      console.log(project.testRuns);
      new ProjectReadyPublisher(brokerWrapper).publish({
        projectId,
        testRunId,
        name,
        commitId,
        projectPath,
        testMethodName,
        configurationFolder,
        moduleName,
      });
    } catch (err: any) {
      console.log(err.stdout);
      project.logStderrBuildpack = err.stdout;
    } finally {
      await project.save();
    }
  }
}
