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
        database: DB_DATABASE,
        synchronize: true,
        logging: true,
        entities: []
    });

    const db = await SqlDatabase.fromDataSourceParams({
        appDataSource: dataSource,
    })

    const prompt = PromptTemplate.fromTemplate(`Based on the table schema below, write a MySQL SQL query that would answer the user's question:
            {schema}

            Question: {question}
            SQL Query:
            
            RESPOND ONLY WITH THE SQL QUERY!
            DO NOT WRAP SQL QUERY IN '\`' BACKTICKS!
        `
    );

    const model = new ChatGroq({
        apiKey: GROQ_API_KEY,
        model: 'llama3-70b-8192'
    });

    const sqlQueryGeneratorChain = RunnableSequence.from([
        RunnablePassthrough.assign({
            schema: async () => db.getTableInfo(["DBR"]),
        }),
        prompt,
        model.bind({ stop: ["\nSQLResult:"] }),
        new StringOutputParser(),
    ]);

    await sqlQueryGeneratorChain.invoke({
        question: "What is the count of debtors in the DBR table from the CDS database have dbr_client id TEST01?",
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
            schema: async () => db.getTableInfo(["DBR"]),
            question: (input) => input.question,
            query: (input) => {
                console.log("INPUT =======", input.query.replace('`', ''));
                return input.query
            },
            response: (input) => db.run(input.query),
        },
        finalResponsePrompt,
        model,
    ]);

    const finalResponse = await fullChain.invoke({
        question: "What is the count of debtors in the DBR table from the CDS database have dbr_client id TEST01?",
    });

    console.log(finalResponse);
}

main();
