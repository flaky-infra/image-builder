import {mongoose} from '@typegoose/typegoose';
import {brokerWrapper, FLAKY_EXCHANGE_NAME, getCompleteUri} from 'flaky-common';
import {ProjectBuildListener} from './messages/listeners/project-build-listener';

async function start() {
  if (!process.env.FLAKY_MONGO_URI)
    throw new Error('FLAKY_MONGO_URI must be defined');
  if (!process.env.FLAKY_MONGO_USERNAME)
    throw new Error('FLAKY_MONGO_USERNAME must be defined');
  if (!process.env.FLAKY_MONGO_PASSWORD)
    throw new Error('FLAKY_MONGO_PASSWORD must be defined');
  if (!process.env.FLAKY_RABBITMQ_URI)
    throw new Error('FLAKY_RABBITMQ_URI must be defined');
  if (!process.env.FLAKY_RABBITMQ_USERNAME)
    throw new Error('FLAKY_RABBITMQ_USERNAME must be defined');
  if (!process.env.FLAKY_RABBITMQ_PASSWORD)
    throw new Error('FLAKY_RABBITMQ_PASSWORD must be defined');
  const mongoUri = getCompleteUri(
    process.env.FLAKY_MONGO_URI,
    process.env.FLAKY_MONGO_USERNAME,
    process.env.FLAKY_MONGO_PASSWORD
  );
  const rabbitUri = getCompleteUri(
    process.env.FLAKY_RABBITMQ_URI,
    process.env.FLAKY_RABBITMQ_USERNAME,
    process.env.FLAKY_RABBITMQ_PASSWORD
  );
  await brokerWrapper.connect(rabbitUri, FLAKY_EXCHANGE_NAME, 'topic');
  await mongoose.connect(mongoUri);
  await new ProjectBuildListener(brokerWrapper).listen();
}

start();
