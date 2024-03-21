import fs from 'fs';
import path from 'path';
import pdfParse from 'pdf-parse';
import OpenAI from 'openai';
import { config } from 'dotenv'
config()
const openai = new OpenAI({ apiKey: process.env.API_KEY });


//************************************************************************************************
// instructions for the assistant
const instructions = "you are a ai that finds quotes of provided theme from a provided text. you will only responds with a list of quotes from the text provided. If you can not find quotes please respond with an empty string. please put your response in an array."

// the prompt given + the user input -> each chunk will be added to the end of the prompt when needed.
const defaultPrompt = `please find 0 to 5 of the best quotes from the following text thet help Characterization`

const userInput = "Elwood"
const messageContent = `${defaultPrompt} '${userInput}':`

//the name of the book pdf to find quotes for
//make sure to put pdf at the end
const bookName = "TheNickelBoys"
const bookFileName = `${bookName}/The Nickel Boys.pdf`
const responsceFolder = `./books/${bookName}/quotes`

//************************************************************************************************


// Read your PDF file
const pdfFile = fs.readFileSync(`./books/${bookFileName}`);

pdfParse(pdfFile).then(function (data) {
    // data.text contains the extracted text
    // Save the extracted text into a .txt file
    fs.writeFileSync(`./books/${bookName}/output.txt`, data.text);
    console.log(`txt file with the book was created! in ./books/${bookName}/output.txt`);
}).catch(error => {
    console.error("Failed to parse PDF:", error);
});

// Path to the input text file
const inputFilePath = `./books/${bookName}/output.txt`;

// Read the content of the input text file
const text = fs.readFileSync(inputFilePath, 'utf8');
deleteFolderContents(responsceFolder).then(() => console.log('Folder contents deleted successfully.'));
let chunks = splitTextIntoChunks(text, 4000);
function splitTextIntoChunks(text, maxWordsPerChunk) {
    const words = text.split(/\s+/); // Split text into words
    const chunks = [];

    for (let i = 0; i < words.length; i += maxWordsPerChunk) {
        const chunk = words.slice(i, i + maxWordsPerChunk);
        chunks.push(chunk.join(' '));
    }

    return chunks;
}
// console.log(chunks);


// Base directory where files will be created
const outputDirectory = `./books/${bookName}/chunks`;
// Ensure the output directory exists
fs.mkdirSync(outputDirectory, { recursive: true });
// Function to create files from array elements
let chunkPaths = []

chunks.forEach((str, index) => {
    // Construct file name with incrementing number
    const fileName = `File_${index + 1}.txt`;
    const filePath = path.join(outputDirectory, fileName);

    // Write the current string to a file
    fs.writeFileSync(filePath, str, 'utf8');
    console.log(`Created file: ${fileName}`);
    chunkPaths.push(filePath);
});
console.log('All files have been successfully created.');

let responces = []

async function processChunksSequentially(paths) {
    let index = 0

    for (const quotePath of paths) {
        let quotes = await extractQuotes(quotePath);
        responces.push(quotes)
        let filePath = path.join(responsceFolder, `File_${index + 1}.txt`);
        let fileContent = JSON.stringify(quotes)
        fs.writeFileSync(filePath, fileContent, 'utf8');
        console.log(`Created file: ${filePath}`);
        index++
    }
    console.log(responces)
    let filePath = path.join(responsceFolder, `everything.txt`)
    let fileContent = JSON.stringify(responces)
    fs.writeFileSync(filePath, fileContent, 'utf8');
    console.log(`Created file: ${filePath}`);
    console.log("All the quotes have been put into one file ^")
    main()
}

console.log(chunkPaths)
processChunksSequentially(chunkPaths).catch(console.error);


async function extractQuotes(path) {
    let chunk = fs.readFileSync(path, 'utf8');

    const assistant = await openai.beta.assistants.create({
        name: "quote finder",
        instructions: instructions,
        model: "gpt-4-0125-preview",
    })

    const thread = await openai.beta.threads.create({
        messages: [{
            "role": "user",
            "content": messageContent + chunk,
        }]
    })


    const run = await openai.beta.threads.runs.create(
        thread.id,
        { assistant_id: assistant.id }
    );

    console.log(run)

    return new Promise((resolve, reject) => {

        const checkStatusandPrintMessage = async (threadId, runId) => {
            try {
                let runStatus = await openai.beta.threads.runs.retrieve(threadId, runId)
                if (runStatus.status === "completed") {
                    let messages = await openai.beta.threads.messages.list(threadId)
                    messages.data.forEach((msg) => {
                        const role = msg.role
                        const content = msg.content[0].text.value
                        console.log(
                            // `${role.charAt(0).toUpperCase() + role.slice(1)}:         ${content}`
                            "response made"
                        )
                    })
                    const resp = messages.data.filter(msg => msg.role === 'assistant') // Filter for assistant responses
                        .map(msg => msg.content[0].text.value);
                    resolve(resp);
                }
                else {
                    console.log(`run is not compleated yet + ${runStatus.status}`)
                    resolve(null);

                    // console.log(runStatus)
                }
            } catch (error) {
                reject(error); // Reject on checkStatus error

            }
        }

        setTimeout(() => {
            checkStatusandPrintMessage(thread.id, run.id)
        }, 40000)
    }
    )
}


async function main() {

    const completion = await openai.chat.completions.create({
        messages: [{ role: "system", content: `please pick out the best quotes for the follow prompt: "${messageContent}" here are the quotes to choose from: ${responces.join()}` }],
        model: "gpt-4-turbo-preview",
    });

    console.log(completion.choices[0]);
    let filePath = path.join(responsceFolder, `bestQuotes.txt`)
    // let fileContent = JSON.stringify(responces)
    let fileContent = responces.join()

    fs.writeFileSync(filePath, fileContent, 'utf8');
    console.log(`Created file: ${filePath}`);
    console.log("All the BEST quotes have been put into one file ^")
}




async function deleteFolderContents(folderPath) {
    try {
        const files = await fs.readdir(folderPath, { withFileTypes: true });
        for (const file of files) {
            const fullPath = path.join(folderPath, file.name);
            if (file.isDirectory()) {
                await deleteFolderContents(fullPath);
                await fs.rmdir(fullPath);
            } else {
                await fs.unlink(fullPath);
            }
        }
    } catch (error) {
        console.error('Error deleting folder contents:', error);
    }
}