# Earnings Call Transcript Cleaner

An AI-powered web application that uses OpenAI to clean and standardize earnings call transcripts. The app corrects speaker names and titles while preserving the actual transcript content unchanged.

## Features

- **Smart Name & Title Correction**: Uses OpenAI GPT-4 to identify and correct misspelled names and standardize job titles
- **Content Preservation**: Only modifies speaker labels, leaving all spoken content completely unchanged
- **Long Transcript Support**: Handles lengthy earnings call transcripts using GPT-4's large context window (128K tokens)
- **Clean Interface**: Simple, intuitive web interface for pasting and processing transcripts
- **Export Options**: Copy to clipboard or download cleaned transcripts as text files
- **Token Usage Tracking**: See how many tokens were used for each processing request

## Installation

1. **Clone or download this repository**

2. **Install Node.js dependencies**:
```bash
npm install
```

3. **Set up your OpenAI API key**:
   - Create a `.env` file in the root directory
   - Add your OpenAI API key:
   ```
   OPENAI_API_KEY=sk-your-actual-api-key-here
   ```

4. **Build the TypeScript code**:
```bash
npm run build
```

## Usage

1. **Start the application**:
```bash
npm start
```

Or for development with auto-reload:
```bash
npm run dev
```

2. **Open your browser** and navigate to:
```
http://localhost:5000
```

3. **Use the app**:
   - Paste your raw earnings call transcript into the left text area
   - Click "Clean Transcript"
   - Wait for processing (may take 10-30 seconds for long transcripts)
   - View the cleaned transcript on the right
   - Copy to clipboard or download as needed

## How It Works

The application uses OpenAI's GPT-4 model with carefully crafted prompts that:

1. Identify speaker labels in the format `Name(Title)`
2. Correct any misspelled names
3. Standardize job titles and roles
4. Preserve all transcript content, line breaks, and structure
5. Return only the corrected transcript without commentary

The system prompt specifically instructs the AI to **only** modify speaker names/titles and leave all other content unchanged.

## Cost Considerations

- The app uses GPT-4o which costs approximately $5 per 1M input tokens and $15 per 1M output tokens
- A typical earnings call transcript (10,000-30,000 words) uses approximately 15,000-40,000 tokens
- Estimated cost per transcript: $0.10 - $0.30

## Requirements

- Node.js 18+ or 20+
- npm or yarn
- OpenAI API key
- Internet connection

## Scripts

- `npm run build` - Compile TypeScript to JavaScript
- `npm start` - Run the compiled server
- `npm run dev` - Run in development mode with ts-node
- `npm run watch` - Watch TypeScript files for changes

## Security Notes

- Never commit your `.env` file with your actual API key
- Keep your `OPENAI_API_KEY` secret and secure
- Consider implementing rate limiting for production use

## License

MIT License - Feel free to use and modify as needed.

