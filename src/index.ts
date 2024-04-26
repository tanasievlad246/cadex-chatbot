import "reflect-metadata"

import { ChatGroq } from "@langchain/groq";
import { ChatPromptTemplate, PromptTemplate } from "@langchain/core/prompts";
import { DataSource } from 'typeorm';
import { SqlDatabase } from "langchain/sql_db";
import { RunnablePassthrough, RunnableSequence } from "@langchain/core/runnables";
import { StringOutputParser } from "@langchain/core/output_parsers";

import dotenv from "dotenv";
dotenv.config();

async function main() {
    console.log(process.env);

    const { GROQ_API_KEY, DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_DATABASE } = process.env;

    if (!DB_HOST || !DB_PORT || !DB_USER || !DB_PASSWORD || !DB_DATABASE || !GROQ_API_KEY) {
        throw new Error("Missing environment variables");
    }

    const dataSource = new DataSource({
        type: "mysql",
        host: DB_HOST,
        port: parseInt(DB_PORT),
        username: DB_USER,
        password: DB_PASSWORD,
        synchronize: true,
        logging: true,
        entities: []
    });

    const db = await SqlDatabase.fromDataSourceParams({
        appDataSource: dataSource,
    })

    const prompt = PromptTemplate.fromTemplate(`Based on the table schema below, write a SQL query that would answer the user's question:
        {schema}

        Question: {question}
        SQL Query:`
    );

    const model = new ChatGroq({
        apiKey: GROQ_API_KEY,
        model: 'llama3-8b-8192'
    });

    const sqlQueryGeneratorChain = RunnableSequence.from([
        RunnablePassthrough.assign({
            schema: async () => db.getTableInfo(),
        }),
        prompt,
        model.bind({ stop: ["\nSQLResult:"] }),
        new StringOutputParser(),
    ]);

    const result = await sqlQueryGeneratorChain.invoke({
        question: "How many debtors in the DBR table from the CDS database have dbr_client id TEST01?",
    });

    console.log({
        result,
    });

    const finalResponsePrompt =
        PromptTemplate.fromTemplate(`Based on the table schema below, question, sql query, and sql response, write a natural language response:
            {schema}

            Question: {question}
            SQL Query: {query}
            SQL Response: {response}`
        );

    const fullChain = RunnableSequence.from([
        RunnablePassthrough.assign({
            query: sqlQueryGeneratorChain,
        }),
        {
            schema: async () => db.getTableInfo(),
            question: (input) => input.question,
            query: (input) => input.query,
            response: (input) => db.run(input.query),
        },
        finalResponsePrompt,
        model,
    ]);

    const finalResponse = await fullChain.invoke({
        question: "How many debtors in the DBR table from the CDS database have dbr_client TEST01?",
    });

    console.log(finalResponse);
}

main();
