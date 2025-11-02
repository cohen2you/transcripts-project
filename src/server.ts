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
When the operator introduces someone, that person MUST be the next speaker (not someone else).

Common Error Pattern to Fix:
Operator says: "Our next question is from Jeffrey Bernstein with Barclays. Please proceed."
WRONG next speaker: Rob Lynch (CEO) - This is incorrect!
CORRECT next speaker: Jeffrey Bernstein (Barclays) - The person who was just introduced!

Example Fix:
Bad:
<strong>Operator</strong>

Our next question is from Jeffrey Bernstein with Barclays. Please proceed.

<strong>Rob Lynch</strong> (Chief Executive Officer)

Great, thank you. Just wanted to build on...

Good (Fix it to):
<strong>Operator</strong>

Our next question is from Jeffrey Bernstein with Barclays. Please proceed.

<strong>Jeffrey Bernstein</strong> (Barclays)

Great, thank you. Just wanted to build on...

CRITICAL RULES:
- The person introduced by the operator MUST be the next speaker
- Extract company names from introductions (e.g., "with Barclays" → add "(Barclays)" to speaker label)
- If a different name appears after an introduction, it's almost always an error - fix it to match who was introduced
- Always keep the operator's full introduction intact including "Please proceed" or "Please go ahead"

ANOTHER COMMON ERROR - Question/Answer transitions:
When an analyst asks a question, the company executive's ANSWER often gets incorrectly labeled as the analyst still speaking.

Pattern to detect:
- Analyst asks a question (ends with "Thanks" or a question mark)
- Same speaker label continues BUT the content is clearly an ANSWER not a question
- Look for: addressing the analyst by name ("Brian?", "Great question"), references to internal operations, "we/our/I" from company perspective

Example Error:
<strong>Brian Vaccaro</strong> (Raymond James)

Can you elaborate on guest satisfaction metrics? Thanks.

Brian? I had a call with Stephanie last night... [This is NOT Brian speaking - it's the CEO answering!]

Should be fixed to:
<strong>Brian Vaccaro</strong> (Raymond James)

Can you elaborate on guest satisfaction metrics? Thanks.

<strong>Rob Lynch</strong> (Chief Executive Officer)

Brian? I had a call with Stephanie last night...

IMPORTANT: Insert the appropriate company executive speaker label (CEO, CFO, etc.) when you detect an answer to an analyst's question that's incorrectly under the analyst's name.

ANOTHER COMMON ERROR - Missing speaker labels for follow-up questions:
After an executive answers, the analyst often asks a follow-up question BUT the speaker label is missing entirely.

Pattern to detect:
- Executive finishes answering a question
- Text continues with phrases like "Great. And then..." or "Thanks. My follow-up is..." or "And I have a follow up"
- This is clearly the ANALYST asking another question, not the executive still talking
- The analyst's name was recently introduced by the operator

Example Error:
<strong>Katie Fogarty</strong> (Chief Financial Officer)

...without having to lean on a significant amount of price to offset the beef market.

Great. And then I had another question about the labor savings... [This is Jake asking a follow-up, NOT Katie!]

Should be fixed to:
<strong>Katie Fogarty</strong> (Chief Financial Officer)

...without having to lean on a significant amount of price to offset the beef market.

<strong>Jake Bartlett</strong> (Truro Securities)

Great. And then I had another question about the labor savings...

<strong>Rob Lynch</strong> (Chief Executive Officer)

So one of the big opportunity untapped opportunities is on equipment...

IMPORTANT: Insert analyst speaker labels when you detect follow-up questions that are missing labels. Look for transitions like "Great. And then...", "Thanks. My follow-up...", "And I have a follow up", etc.

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

