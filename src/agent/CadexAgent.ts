import { ChatGroq } from '@langchain/groq';
import { config } from 'dotenv';
import { PromptTemplate } from '@langchain/core/prompts';

async function setupAgent() {
  config();
  const { GROQ_API_KEY } = process.env;

  if (!GROQ_API_KEY) {
    throw new Error('Missing environment variables');
  }

  const model = new ChatGroq({
    apiKey: GROQ_API_KEY,
    model: 'llama3-70b-8192',
  });

  const promptTemplate = PromptTemplate.fromTemplate(
    'Tell me a joke about {topic}'
  );

  const chain = promptTemplate.pipe(model);

  const result = await chain.invoke({ topic: 'bears' });

  console.log(result.content);
}
