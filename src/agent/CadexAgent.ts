import { ChatGroq } from '@langchain/groq';
import { ChatPromptTemplate } from 'langchain/prompts';
import { DynamicTool } from 'langchain/tools';
import { AgentExecutor, createToolCallingAgent } from 'langchain/agents';

const model = new ChatGroq({
    apiKey: process.env.GROQ_API_KEY,
    model: 'llama3-70b-8192'
})

model.bind({
    tools: [
        {
            type: 'function',
            function: {
                name: 'get_value_of_foo',
                parameters: {},
                description: 'Get the value for foo (also known as FOO)',
            }
        }
    ],
    tool_choice: 'auto'
})

const prompt = ChatPromptTemplate.fromMessages([
    ["system", "You are a helpful assistant"],
    ["placeholder", "{chat_history}"],
    ["human", "{input}"],
    ["placeholder", "{agent_scratchpad}"],
]);

const tools = [
    new DynamicTool({
        name: 'getValueOfFoo',
        description: 'Returns the value of foo (aslo could be Foo or FOO or other variations)',
        func: async () => 'baz'
    })
]

const agent = createToolCallingAgent({
    llm: model,
    tools,
    prompt
})

const agentExecutor = new AgentExecutor({
    agent,
    tools
})

export default agentExecutor;
