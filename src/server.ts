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

// Request logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.path}`);
  next();
});

// Serve the main page
app.get('/', (req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Process transcript endpoint
app.post('/api/process', async (req: Request, res: Response) => {
  try {
    console.log('📝 Processing transcript...');
    const { transcript } = req.body;

    if (!transcript) {
      return res.status(400).json({ error: 'No transcript provided' });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: 'OpenAI API key not configured' });
    }
    
    console.log(`   Transcript length: ${transcript.length} characters`);

    const systemPrompt = `You are a transcript editor specialized in cleaning earnings call transcripts. 
Your ONLY job is to:
1. Remove any standalone "0" numbers that appear after speaker labels
2. Format speaker labels with HTML bold tags: <strong>Name</strong>
3. Use COMPANY NAME ONLY for analysts (NO person names)
4. Fix OBVIOUS analyst firm name misspellings (e.g., "Truro Securities" → "Truist Securities")
5. Fix obvious formatting issues in speaker labels

CRITICAL RULES:
- DO NOT change, modify, or correct ANY of the actual spoken content/dialogue
- DO NOT add, remove, or modify any words in the transcript body
- Preserve all line breaks, spacing, and structure exactly as provided
- Only fix OBVIOUS company misspellings (JP Morgon→JP Morgan, Goldman Sacks→Goldman Sachs, Truro→Truist)
- DO NOT change executive/person names
- Use HTML tags <strong></strong> NOT markdown ** for bold

SPEAKER LABEL FORMATS (CRITICAL - FOLLOW EXACTLY):

For ANALYSTS (people from investment firms asking questions):
WRONG: Jake Bartlett (Truro Securities Analyst)
WRONG: Jake Bartlett (Equity Analyst at Truro Securities)  
WRONG: <strong>Jake Bartlett</strong> (Truro Securities)
RIGHT: <strong>Truro Securities Analyst</strong>

Pattern: Remove the person's name completely. Only use: <strong>[Company Name] Analyst</strong>

More examples:
- "Jeffrey Bernstein with Barclays" → <strong>Barclays Analyst</strong>
- "Brian Vaccaro from Goldman Sachs" → <strong>Goldman Sachs Analyst</strong>
- "Jake Bartlett(Equity Analyst at Truro Securities)" → <strong>Truro Securities Analyst</strong>

For EXECUTIVES (company employees like CEO, CFO):
- Keep the person's name + title
- <strong>Rob Lynch</strong> (Chief Executive Officer)
- <strong>Katie Fogarty</strong> (Chief Financial Officer)

For OPERATOR:
- <strong>Operator</strong>

CRITICAL: For analysts, DELETE the person's name entirely. Only keep company + "Analyst"

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

ANOTHER COMMON ERROR - Missing analyst labels for follow-up questions:
After an executive answers, the analyst often asks a follow-up question BUT the speaker label is missing.

Pattern to detect:
- Executive finishes answering
- Text continues with "Great. And then..." or "Thanks. My follow-up is..." or "Understood..."
- This is the ANALYST asking another question
- Use the company name that was recently introduced

Example Error:
<strong>Katie Fogarty</strong> (Chief Financial Officer)

...without having to lean on a significant amount of price to offset the beef market.

Great. And then I had another question about the labor savings... [This is the analyst!]

Should be fixed to:
<strong>Katie Fogarty</strong> (Chief Financial Officer)

...without having to lean on a significant amount of price to offset the beef market.

<strong>Truist Securities Analyst</strong>

Great. And then I had another question about the labor savings...

<strong>Rob Lynch</strong> (Chief Executive Officer)

So one of the big opportunity untapped opportunities is on equipment...

IMPORTANT: For analyst follow-ups, insert <strong>Company Name Analyst</strong> label using the company from the operator's introduction.

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

    let cleanedTranscript = completion.choices[0].message.content || '';
    const tokensUsed = completion.usage?.total_tokens || 0;

    // Remove markdown code fences if present (multiple patterns)
    cleanedTranscript = cleanedTranscript
      .replace(/^```html\s*/gi, '')  // ```html at start
      .replace(/^```\s*/g, '')        // ``` at start
      .replace(/\s*```$/g, '')        // ``` at end
      .trim();

    // Convert any markdown bold (**text**) to HTML (<strong>text</strong>)
    cleanedTranscript = cleanedTranscript.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

    console.log(`   ✅ Cleaned! Tokens used: ${tokensUsed}`);

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
    console.log('📋 Segmenting transcript...');
    const { transcript } = req.body;

    if (!transcript) {
      return res.status(400).json({ error: 'No transcript provided' });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: 'OpenAI API key not configured' });
    }
    
    console.log(`   Transcript length: ${transcript.length} characters`);

    const systemPrompt = `Add paragraph breaks to improve readability. 

Rules:
- DO NOT change any words
- ONLY add line breaks at logical topic changes
- Break every 3-5 sentences
- Preserve all <strong> tags and formatting

Return the segmented transcript only.`;

    const userPrompt = `Add paragraph breaks to this transcript:

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

    let segmentedTranscript = completion.choices[0].message.content || '';
    const tokensUsed = completion.usage?.total_tokens || 0;

    // Remove markdown code fences if present (multiple patterns)
    segmentedTranscript = segmentedTranscript
      .replace(/^```html\s*/gi, '')
      .replace(/^```\s*/g, '')
      .replace(/\s*```$/g, '')
      .trim();

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

// Helper function to pre-process transcript and add missing labels after operator handoffs
function preprocessMissingLabels(transcript: string): { transcript: string; changes: string[] } {
  const changes: string[] = [];
  let processed = transcript;
  
  // Pattern: Operator text ending with "Please go ahead" followed by text without label
  // This handles executive introductions like "turn the call over to Dr. Tony Han. Please go ahead Sir"
  const handoffPattern = /((?:<strong>)?Operator(?:<\/strong>)?|OPERATOR\(\))\s*\n\s*0?\s*\n([\s\S]*?)(?:turn\s+the\s+call\s+over\s+to|I will now turn the call over to|I will turn the call over to)\s+([^\.\,\n]+?)(?:\.|,)\s*(?:Please\s+go\s+ahead|Please\s+proceed|Go\s+ahead)(?:\s+Sir)?(?:\.)?\s*\n\s*\n([\s\S]{0,200}?)(?=\n\s*<strong>|\n\s*[A-Z][A-Z]+\(\)|$)/gi;
  
  let match;
  const matches: Array<{index: number, name: string, title: string, insertPos: number}> = [];
  
  while ((match = handoffPattern.exec(processed)) !== null) {
    const personName = match[3].trim();
    const nextText = match[4].trim();
    
    // Check if next text starts with a label
    if (nextText && !nextText.match(/^\s*<strong>|^\s*[A-Z][A-Z]+\(\)/)) {
      // Extract title from operator text
      let title = '';
      const operatorText = match[2];
      const titleMatch = operatorText.match(/(CEO|CFO|Chief\s+Executive\s+Officer|Chief\s+Financial\s+Officer|President|Chairman|founder)/i);
      if (titleMatch) {
        title = ` (${titleMatch[0]})`;
      }
      
      const insertPos = match.index! + match[0].length - nextText.length;
      matches.push({ index: match.index!, name: personName, title, insertPos });
    }
  }
  
  // Insert labels in reverse order to maintain positions
  matches.reverse().forEach(m => {
    const formattedName = m.name.replace(/\s+/g, ' ').trim();
    const newLabel = `\n<strong>${formattedName}</strong>${m.title}\n\n`;
    processed = processed.substring(0, m.insertPos) + newLabel + processed.substring(m.insertPos);
    changes.push(`Added missing label for ${formattedName} after operator introduction`);
  });
  
  // Also check for analyst introductions
  const analystPattern = /((?:<strong>)?Operator(?:<\/strong>)?|OPERATOR\(\))\s*\n\s*0?\s*\n([\s\S]*?)(?:Our\s+next\s+question\s+is\s+from|question\s+from)\s+[^,]+?\s+(?:with|from)\s+([^\.\,\n]+?)(?:\.|,)\s*(?:Please\s+proceed|Please\s+go\s+ahead|Go\s+ahead)(?:\.)?\s*\n\s*\n([\s\S]{0,200}?)(?=\n\s*<strong>|\n\s*[A-Z][A-Z]+\(\)|$)/gi;
  
  const analystMatches: Array<{company: string, insertPos: number}> = [];
  
  while ((match = analystPattern.exec(processed)) !== null) {
    const companyName = match[3].trim();
    const nextText = match[4].trim();
    
    if (nextText && !nextText.match(/^\s*<strong>|^\s*[A-Z][A-Z]+\(\)/)) {
      const insertPos = match.index! + match[0].length - nextText.length;
      analystMatches.push({ company: companyName, insertPos });
    }
  }
  
  analystMatches.reverse().forEach(m => {
    const newLabel = `\n<strong>${m.company} Analyst</strong>\n\n`;
    processed = processed.substring(0, m.insertPos) + newLabel + processed.substring(m.insertPos);
    changes.push(`Added missing label for ${m.company} Analyst after operator introduction`);
  });
  
  return { transcript: processed, changes };
}

// Verify speaker attribution endpoint
app.post('/api/verify-speakers', async (req: Request, res: Response) => {
  try {
    console.log('👥 Verifying speaker attributions...');
    let { transcript } = req.body;

    if (!transcript) {
      return res.status(400).json({ error: 'No transcript provided' });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: 'OpenAI API key not configured' });
    }
    
    console.log(`   Transcript length: ${transcript.length} characters`);

    // Pre-process: Add missing labels after operator handoffs
    const preprocessResult = preprocessMissingLabels(transcript);
    transcript = preprocessResult.transcript;
    const preprocessChanges = preprocessResult.changes;
    
    if (preprocessChanges.length > 0) {
      console.log(`   🔧 Pre-processing fixes: ${preprocessChanges.join(', ')}`);
    }

    const systemPrompt = `You are a transcript editor fixing speaker attribution errors in earnings calls.

CRITICAL ERROR #1 - Missing speaker label after operator introduction:
When operator introduces someone (analyst or executive), the VERY NEXT text MUST have a speaker label. If there's no label, you MUST add one.

Example ERROR (Missing Label):
<strong>Operator</strong>

I will now turn the call over to Dr. Tony Han. Please go ahead Sir.

Thank you. Hello everyone. Thank you for joining us today... [MISSING LABEL!]

This is WRONG because:
- Operator introduced "Dr. Tony Han" and said "Please go ahead Sir"
- The next text "Thank you. Hello everyone..." has NO speaker label
- This text is clearly Dr. Tony Han speaking (greeting after being introduced)

CORRECT to:
<strong>Operator</strong>

I will now turn the call over to Dr. Tony Han. Please go ahead Sir.

<strong>Dr. Tony Han</strong> (Chief Executive Officer)

Thank you. Hello everyone. Thank you for joining us today...

RULE: After ANY operator introduction ending with "Please go ahead", "Please proceed", or "Go ahead", the next text MUST have a speaker label. If missing, ADD the label for the person just introduced.

CRITICAL ERROR #2 - Wrong speaker after operator introduction:
When operator introduces an analyst, the VERY NEXT speaker MUST be that analyst, NOT a company executive.

Example ERROR to fix:
<strong>Operator</strong>

Our next question is from Jeffrey Bernstein with Barclays. Please proceed.

<strong>Rob Lynch</strong> (Chief Executive Officer)

Great, thank you. Just wanted to build on... [analyst's question continues]

This is WRONG because:
- Operator introduced Jeffrey Bernstein with Barclays
- But Rob Lynch (CEO) is labeled as speaking
- "Great, thank you. Just wanted to build on..." is clearly the ANALYST asking a question, not the CEO

CORRECT to:
<strong>Operator</strong>

Our next question is from Jeffrey Bernstein with Barclays. Please proceed.

<strong>Barclays Analyst</strong>

Great, thank you. Just wanted to build on... [analyst's question]

<strong>Rob Lynch</strong> (Chief Executive Officer)

Yeah, I mean our, you know, our product innovation... [CEO's answer]

RULE: Person introduced by operator = next speaker. If you see an executive name there instead, DELETE it and insert the analyst's company label.

CRITICAL ERROR #3 - Executive's answer under analyst's label:
When analyst asks question, executive's answer often appears under analyst's name.
Look for: executive addressing analyst by name, "we/our" company perspective.

CRITICAL ERROR #4 - Missing analyst label for follow-ups:
When executive finishes answering and text continues with "Understood...", "Thanks...", "Great...", "Right..." → This is analyst asking follow-up.

HANDOFF PHRASES TO WATCH FOR:
- "Please go ahead" / "Please go ahead Sir" / "Please proceed" / "Go ahead"
- "I will now turn the call over to [Name]"
- "I will turn the call over to [Name]"
- "turn the call over to [Name]"
- "Our next question is from [Name]"

After ANY of these phrases, the next text MUST have a speaker label. If it's missing, ADD it.

LABEL FORMAT:
- Analysts: <strong>Company Analyst</strong> (extract company from operator introduction)
- Executives: <strong>Person Name</strong> (Title) - extract title from operator introduction if mentioned

RULES:
- DO NOT change any words
- ONLY add/fix speaker labels
- Preserve all HTML formatting
- If operator introduces someone and next text has no label, ADD the label

OUTPUT FORMAT:
Return the corrected transcript text, then add:
---CHANGES---
Then list each fix you made, like:
- Added missing label for "Dr. Tony Han" after operator introduced them
- Changed "Wrong Name" to "Correct Label" after operator introduced them
- Added "Company Analyst" label for follow-up question
OR write: No errors found`;

    const userPrompt = `Please verify and correct ONLY the speaker attributions in this transcript. Do not change any words or formatting.

Pay special attention to:
1. Missing speaker labels after operator introductions (especially after "Please go ahead" or "turn the call over to")
2. Wrong speaker labels after operator introductions
3. Executive answers incorrectly under analyst labels
4. Missing analyst labels for follow-up questions

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

    let fullResponse = completion.choices[0].message.content || '';
    const tokensUsed = completion.usage?.total_tokens || 0;

    // Remove markdown code fences if present (multiple patterns)
    fullResponse = fullResponse
      .replace(/^```html\s*/gi, '')
      .replace(/^```\s*/g, '')
      .replace(/\s*```$/g, '')
      .trim();

    // Split response into transcript and changes
    let verifiedTranscript = fullResponse;
    let changesSummary = 'Verified speaker attributions and corrected any misplaced labels';
    
    if (fullResponse.includes('---CHANGES---')) {
      const parts = fullResponse.split('---CHANGES---');
      verifiedTranscript = parts[0].trim();
      const changesText = parts[1].trim();
      
      // Remove template placeholder text if AI included it
      verifiedTranscript = verifiedTranscript.replace(/^\[Corrected transcript\]\s*/i, '');
      
      if (changesText && changesText !== 'No speaker attribution errors found.' && changesText !== 'No errors found') {
        // Combine pre-processing changes with AI changes
        if (preprocessChanges.length > 0) {
          changesSummary = preprocessChanges.join('; ') + '; ' + changesText;
        } else {
          changesSummary = changesText;
        }
      } else {
        if (preprocessChanges.length > 0) {
          changesSummary = preprocessChanges.join('; ');
        } else {
          changesSummary = 'No speaker attribution errors found';
        }
      }
    } else {
      // No AI changes, but might have pre-processing changes
      if (preprocessChanges.length > 0) {
        changesSummary = preprocessChanges.join('; ');
      }
    }

    console.log(`   ✅ Speakers verified! Tokens used: ${tokensUsed}`);
    console.log(`   Changes: ${changesSummary.substring(0, 100)}...`);

    res.json({
      success: true,
      verified_transcript: verifiedTranscript,
      tokens_used: tokensUsed,
      changes_summary: changesSummary,
    });
  } catch (error: any) {
    console.error('Error verifying speakers:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to verify speakers' 
    });
  }
});

// Check company names endpoint (analyst firms only)
app.post('/api/check-company-names', async (req: Request, res: Response) => {
  try {
    console.log('🏢 Checking analyst company names...');
    const { transcript } = req.body;

    if (!transcript) {
      return res.status(400).json({ error: 'No transcript provided' });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: 'OpenAI API key not configured' });
    }
    
    console.log(`   Transcript length: ${transcript.length} characters`);

    const systemPrompt = `You are a financial company name checker for earnings call transcripts.

ONLY correct analyst/investment firm names. Be conservative.

Fix these ONLY:
- "Truro Securities" → "Truist Securities"
- "JP Morgon" → "JP Morgan"
- "Goldman Sacks" → "Goldman Sachs"
- "Morgan Stanley" → "Morgan Stanley"
- Clear misspellings of major banks/investment firms

DO NOT change:
- Executive names (Rob Lynch, Katie Fogarty, etc.)
- Company names you're unsure about
- Person names - NEVER touch these
- Any content/dialogue

Look for labels like: <strong>Truro Securities Analyst</strong>
Only fix the company name if it's obviously misspelled.

RESPONSE FORMAT:
[Corrected transcript]
---CHANGES---
[List company corrections, or write "All company names correct"]`;

    const userPrompt = `Only fix OBVIOUS analyst firm name misspellings. Leave all person names and executive names unchanged.

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

    let fullResponse = completion.choices[0].message.content || '';
    const tokensUsed = completion.usage?.total_tokens || 0;

    // Remove markdown code fences if present (multiple patterns)
    fullResponse = fullResponse
      .replace(/^```html\s*/gi, '')
      .replace(/^```\s*/g, '')
      .replace(/\s*```$/g, '')
      .trim();

    // Split response into transcript and changes
    let correctedTranscript = fullResponse;
    let changesSummary = 'Verified analyst firm names';
    
    if (fullResponse.includes('---CHANGES---')) {
      const parts = fullResponse.split('---CHANGES---');
      correctedTranscript = parts[0].trim();
      const changesText = parts[1].trim();
      
      if (changesText && changesText !== 'All company names correct') {
        changesSummary = changesText;
      } else {
        changesSummary = 'All company names correct';
      }
    }

    console.log(`   ✅ Company names checked! Tokens used: ${tokensUsed}`);
    console.log(`   Changes: ${changesSummary.substring(0, 100)}...`);

    res.json({
      success: true,
      corrected_transcript: correctedTranscript,
      tokens_used: tokensUsed,
      changes_summary: changesSummary,
    });
  } catch (error: any) {
    console.error('❌ Error checking company names:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to check company names' 
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📝 Open your browser and navigate to http://localhost:${PORT}`);
});

