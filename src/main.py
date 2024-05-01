import dotenv
import os

from langchain_core.prompts import ChatPromptTemplate
from langchain_groq import ChatGroq
from langchain_core.tools import tool

dotenv.load_dotenv()

chat = ChatGroq(temperature=0, model_name="llama3-70b-8192", api_key=os.getenv('GROQ_API_KEY'))


system = "You are a helpful assistant."
human = "{text}"
prompt = ChatPromptTemplate.from_messages([("system", system), ("human", human)])

@tool
def getFoo() -> str:
    """Returns the value of foo (also known as FOO)"""
    return 'baz'

chat_with_tools = chat.bind_tools([getFoo])


chain = chat_with_tools | (lambda x: x.tool_calls[0]["args"]) | getFoo

print(chain.invoke(["What is the value of foo?"]))
