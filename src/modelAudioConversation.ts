// @ts-ignore
import AudioRecorder from 'node-audiorecorder'
import { Deepgram, DeepgramClient, LiveTranscriptionEvents, createClient } from "@deepgram/sdk";
import { config } from 'dotenv';
import { ChatGroq } from '@langchain/groq';
import { PromptTemplate } from 'langchain/prompts';
import Speaker from 'speaker';
import { PassThrough } from 'stream';
import fs from 'fs';

async function main() {
    config();
    console.log("At any time press `Ctrl+C` to stop the program.");
    // Import module.

    // Options is an optional parameter for the constructor call.
    // If an option is not given the default value, as seen below, will be used.
    const options = {
        program: `rec`, // Which program to use, either `arecord`, `rec`, or `sox`.
        device: null, // Recording device to use, e.g. `hw:1,0`

        bits: 16, // Sample size. (only for `rec` and `sox`)
        channels: 1, // Channel count.
        encoding: `signed-integer`, // Encoding type. (only for `rec` and `sox`)
        format: `S16_LE`, // Encoding type. (only for `arecord`)
        rate: 16000, // Sample rate.
        type: `wav`, // Format type.

        // Following options only available when using `rec` or `sox`.
        silence: 100, // Duration of silence in seconds before it stops recording.
        thresholdStart: 0.5, // Silence threshold to start recording.
        thresholdStop: 15, // Silence threshold to stop recording.
        keepSilence: true, // Keep the silence in the recording.
    }
    // Optional parameter intended for debugging.
    // The object has to implement a log and warn function.
    const logger = console

    // Create an instance.
    let audioRecorder = new AudioRecorder(options, logger)

    const { DEEPGRAM_API_KEY, GROQ_API_KEY } = process.env;

    if (!DEEPGRAM_API_KEY) {
        throw new Error("Missing DeepGram api key");
    }

    if (!GROQ_API_KEY) {
        throw new Error("Missing environment variables");
    }

    const model = new ChatGroq({
        apiKey: GROQ_API_KEY,
        model: 'llama3-70b-8192'
    });

    const promptTemplate = PromptTemplate.fromTemplate(
        `
            You are a helpfull chatbot agent here to answer questions as best as you can.
            Respond succintly and do not respond with more than 500 characters. 
            
            {question}
        `
    );

    const chain = promptTemplate.pipe(model);

    const deepgram = createClient(DEEPGRAM_API_KEY);

    const dgConnection = deepgram.listen.live({ model: "nova" });

    audioRecorder
        .start()
        .stream()
        .on('data', (data: any) => {
            dgConnection.send(data);
            process.stdin.resume();
        });

    const speaker = new Speaker({
        channels: 2,          // 2 channels for stereo audio
        bitDepth: 16,         // 16-bit samples
        sampleRate: 24000 
    })

    speaker.on('open', () => {
        console.log('Speaker is playing...');
    });

    speaker.on('error', (err) => {
        console.error('Speaker Error:', err);
    });

    const audioStream = new PassThrough();

    dgConnection.addListener(LiveTranscriptionEvents.Open, () => {
        console.log("Connection opened");
        dgConnection.addListener(LiveTranscriptionEvents.Transcript, async (data) => {
            const transcript = data.channel.alternatives[0].transcript;
            if (transcript === "") return;
            const result = await chain.invoke({ question: transcript });
            console.log("------------------------------");
            console.log("TRANSCRIPT: ", transcript);
            console.log("RESPONSE: ", result.content);
            console.log("------------------------------");
            textToSpeech(result.content.toString(), speaker, deepgram);
            process.stdin.resume();
        });

        dgConnection.addListener(LiveTranscriptionEvents.Close, async () => {
            console.log("deepgram: disconnected");
            dgConnection.finish();
        });

        dgConnection.addListener(LiveTranscriptionEvents.Error, async (error) => {
            console.log("deepgram: error received");
            console.error(error);
        });

        dgConnection.addListener(LiveTranscriptionEvents.Warning, async (warning) => {
            console.log("deepgram: warning received");
            console.warn(warning);
        });
    });

    setTimeout(() => {
        console.log("STOPPING...");
        audioRecorder.stop();
        process.stdin.pause();
        process.exit(0);
    }, 90000);

    process.stdin.resume();
};

async function textToSpeech(text: string, speaker: Speaker, deepgram: DeepgramClient) {
    try {
        const response = await deepgram.speak.request(
            { text },
            {
                model: "aura-asteria-en",
                encoding: "linear16",
                container: "wav",
                sample_rate: 48000,
            }
        );

        const stream = await response.getStream()

        if (stream) {
            const buffer = await getAudioBuffer(stream);
            speaker.write(buffer);
        } else {
            console.error("Error generating audio:", stream);
        }
    } catch (error) {
        console.log(error);
        return;
    }
    process.stdin.resume();
}

const getAudioBuffer = async (response: ReadableStream) => {
    const reader = response.getReader();
    const chunks = [];

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        chunks.push(value);
    }

    const dataArray = chunks.reduce(
        (acc, chunk) => Uint8Array.from([...acc, ...chunk]),
        new Uint8Array(0)
    );

    return Buffer.from(dataArray.buffer);
};

main();
