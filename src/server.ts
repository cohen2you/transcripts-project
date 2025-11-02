import express, { Request, Response } from 'express';
import path from 'path';
import dotenv from 'dotenv';
import cors from 'cors';
import OpenAI from 'openai';

// Load environment variables from .env.local or .env
dotenv.config({ path: '.env.local' });
dotenv.config(); // fallback to .env if .env.local doesn't exist

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, '../public')));

// Serve the main page
app.get('/', (req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Process transcript endpoint
app.post('/api/process', async (req: Request, res: Response) => {
  try {
    const { transcript } = req.body;

    if (!transcript) {
      return res.status(400).json({ error: 'No transcript provided' });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: 'OpenAI API key not configured' });
    }

    // Create the prompt for OpenAI
    const systemPrompt = `You are a transcript editor specialized in cleaning earnings call transcripts. 
Your ONLY job is to:
1. Correct any misspelled names of speakers
2. Standardize and correct job titles/roles in parentheses
3. Fix obvious formatting issues in speaker labels
4. Remove any standalone "0" numbers that appear after speaker labels
5. Make speaker names bold using HTML tags: <strong>Name</strong> (Title)
6. Fix misplaced speaker labels - when someone is being INTRODUCED by the operator but isn't speaking yet

CRITICAL RULES:
- DO NOT change, modify, or correct ANY of the actual spoken content/dialogue
- DO NOT add, remove, or modify any words in the transcript body
- ONLY fix speaker names and titles (the parts like "Name(Title)")
- Bold ONLY the speaker name using <strong> tags, NOT the title in parentheses
- Remove any "0" that appears on its own line after speaker labels
- Preserve all line breaks, spacing, and structure exactly as provided
- If a name or title looks correct, leave it unchanged

SPECIAL CASE - Misplaced speaker labels and extracting company names:
When you see a pattern where the operator introduces someone with their company, extract that information:

Bad:
<strong>Krista</strong> (Operator)

Your next question comes from the line of Doug Anmuth with JP Morgan. Please go ahead.

<strong>Doug Anmuth</strong> 

Thanks so much for taking the questions...

Good (Fix it to):
<strong>Krista</strong> (Operator)

Your next question comes from the line of Doug Anmuth with JP Morgan. Please go ahead.

<strong>Doug Anmuth</strong> (JP Morgan)

Thanks so much for taking the questions...

IMPORTANT: Always extract company affiliations from operator introductions and add them to speaker labels in parentheses

Return ONLY the corrected transcript with no additional commentary or explanation.`;

    const userPrompt = `Please review this earnings call transcript and correct only the speaker names and titles. Leave all spoken content unchanged.

Transcript:
${transcript}`;

    // Call OpenAI API
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.1,
    });

    const cleanedTranscript = completion.choices[0].message.content;
    const tokensUsed = completion.usage?.total_tokens || 0;

    res.json({
      success: true,
      cleaned_transcript: cleanedTranscript,
      tokens_used: tokensUsed,
    });
  } catch (error: any) {
    console.error('Error processing transcript:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to process transcript' 
    });
  }
});

// Segment transcript endpoint
app.post('/api/segment', async (req: Request, res: Response) => {
  try {
    const { transcript } = req.body;

    if (!transcript) {
      return res.status(400).json({ error: 'No transcript provided' });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: 'OpenAI API key not configured' });
    }

    const systemPrompt = `You are a transcript editor specializing in improving readability of earnings call transcripts.

Your job is to:
1. Break up long blocks of text into logical, readable paragraphs
2. Insert paragraph breaks at natural topic changes or transitions
3. Make the transcript easier to read while keeping it professional

CRITICAL RULES:
- DO NOT change, add, or remove ANY words from the transcript
- DO NOT modify speaker names or formatting
- ONLY add paragraph breaks (line breaks) at logical points
- Preserve all <strong> tags and existing structure
- Each paragraph should be 3-5 sentences or a complete thought
- Break at topic changes, question transitions, or natural pauses
- Keep speaker labels exactly as they are

Return ONLY the segmented transcript with no additional commentary or explanation.`;

    const userPrompt = `Please segment this transcript into logical, readable paragraphs without changing any words.

Transcript:
${transcript}`;

    // Call OpenAI API
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.1,
    });

    const segmentedTranscript = completion.choices[0].message.content;
    const tokensUsed = completion.usage?.total_tokens || 0;

    res.json({
      success: true,
      segmented_transcript: segmentedTranscript,
      tokens_used: tokensUsed,
    });
  } catch (error: any) {
    console.error('Error segmenting transcript:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to segment transcript' 
    });
  }
});

// Check name spelling endpoint
app.post('/api/check-names', async (req: Request, res: Response) => {
  try {
    const { transcript } = req.body;

    if (!transcript) {
      return res.status(400).json({ error: 'No transcript provided' });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: 'OpenAI API key not configured' });
    }

    const systemPrompt = `You are an expert fact-checker specializing in verifying proper names of people and companies in earnings call transcripts.

Your job is to:
1. Identify all person names and company names in the transcript
2. Verify correct spelling based on your knowledge
3. Flag any names that appear to be misspelled
4. Provide corrections for misspelled names
5. Return the corrected transcript with proper spellings

CRITICAL RULES:
- ONLY correct misspellings of proper names (people and companies)
- DO NOT change any other content, dialogue, or structure
- Use your knowledge to verify correct spellings of executives, analysts, and companies
- Preserve all formatting including <strong> tags and line breaks
- If a name is already correct, leave it unchanged

Return ONLY the corrected transcript with no additional commentary or explanation.`;

    const userPrompt = `Please verify and correct any misspelled names (people and companies) in this transcript. Leave everything else unchanged.

Transcript:
${transcript}`;

    // Call OpenAI API
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.1,
    });

    const correctedTranscript = completion.choices[0].message.content;
    const tokensUsed = completion.usage?.total_tokens || 0;

    res.json({
      success: true,
      corrected_transcript: correctedTranscript,
      tokens_used: tokensUsed,
    });
  } catch (error: any) {
    console.error('Error checking names:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to check names' 
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📝 Open your browser and navigate to http://localhost:${PORT}`);
});

