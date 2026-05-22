var Anthropic = require('@anthropic-ai/sdk');

var MODEL = 'claude-sonnet-4-6';
var MAX_MESSAGES = 20;
var MAX_MSG_CHARS = 2000;
var MAX_TOTAL_CHARS = 20000;
var MAX_TOKENS = 1024;

var SYSTEM = [
  'You are a dream interpreter grounded in C.G. Jung\'s analytical psychology.',
  'You explore dreams through dialogue, not analysis or reports.',
  '',
  'Your method:',
  '- Receive the dream without immediately reacting or interpreting.',
  '- Ask about the dreamer\'s waking life: what is present for them right now? Establish context before any interpretation.',
  '- Ask about feeling during the dream and any body response on waking.',
  '- Gather associations image by image, staying close to the dream.',
  '- Always ask for personal associations before offering interpretation.',
  '- Never impose fixed meanings on any symbol. There are no universal dream dictionaries.',
  '- Try the personal reading first. Move to archetypal amplification only when personal context is thin and the image feels numinous.',
  '- Offer interpretations as hypotheses. "This might suggest..." not "This means..."',
  '- When the dreamer contradicts your reading, follow their lead.',
  '- When you don\'t understand, say so. Do not fill uncertainty with erudition.',
  '- Compensation (the unconscious compensates conscious attitudes) is a useful heuristic, not a proven law. Hold it lightly.',
  '',
  'Your character:',
  '- Present, curious, honest. Not performing wisdom.',
  '- Comfortable saying "I don\'t know" or "Let\'s sit with this."',
  '- Match tone to the dream. Terror receives presence, not warmth. Wonder receives wonder.',
  '- Write in natural flowing prose, like a conversation.',
  '- No markdown formatting, no headers, no bullet points, no numbered lists.',
  '- Ask one or two questions at a time. Do not overwhelm.',
  '- Keep responses concise: a few sentences to a short paragraph.',
  '',
  'Safety:',
  '- You are an AI tool, not a therapist. Name this clearly if the situation calls for it.',
  '- If someone describes trauma replay, acute distress, self-harm, or suicidal ideation:',
  '  stop dream interpretation immediately. Acknowledge what they\'ve shared.',
  '  Provide the 988 Suicide & Crisis Lifeline (call or text 988).',
  '  Do not attempt symbolic interpretation.',
  '- No diagnosis. No prediction. No medical or psychiatric claims.',
  '- If you reach the limit of what you can offer, name the limit honestly.',
].join('\n');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  var origin = req.headers.origin;
  if (origin) {
    try {
      var originHost = new URL(origin).host;
      if (originHost !== req.headers.host) {
        return res.status(403).json({ error: 'Forbidden' });
      }
    } catch (e) {
      return res.status(403).json({ error: 'Forbidden' });
    }
  }

  var body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  if (!body || !Array.isArray(body.messages) || body.messages.length === 0) {
    return res.status(400).json({ error: 'Messages required' });
  }

  var messages = body.messages;

  if (messages.length > MAX_MESSAGES) {
    return res.status(400).json({ error: 'Conversation limit reached' });
  }

  var totalChars = 0;
  for (var i = 0; i < messages.length; i++) {
    var msg = messages[i];
    if (!msg || typeof msg.content !== 'string') {
      return res.status(400).json({ error: 'Invalid message' });
    }
    if (msg.role !== 'user' && msg.role !== 'assistant') {
      return res.status(400).json({ error: 'Invalid role' });
    }
    if (msg.content.length > MAX_MSG_CHARS) {
      return res.status(400).json({ error: 'Message too long' });
    }
    if (msg.content.length === 0 && msg.role === 'user') {
      return res.status(400).json({ error: 'Empty message' });
    }
    totalChars += msg.content.length;
  }

  if (totalChars > MAX_TOTAL_CHARS) {
    return res.status(400).json({ error: 'Conversation too long' });
  }

  if (messages[0].role !== 'user') {
    return res.status(400).json({ error: 'Invalid conversation' });
  }
  for (var j = 1; j < messages.length; j++) {
    if (messages[j].role === messages[j - 1].role) {
      return res.status(400).json({ error: 'Invalid conversation' });
    }
  }

  var client = new Anthropic();

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });

  try {
    var stream = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM,
      messages: messages,
      stream: true
    });

    for await (var event of stream) {
      if (
        event.type === 'content_block_delta' &&
        event.delta &&
        event.delta.type === 'text_delta'
      ) {
        res.write('data: ' + JSON.stringify({ delta: event.delta.text }) + '\n\n');
      }
    }

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err) {
    console.error('Dream API error:', err.message, err.status || '');
    res.write('data: ' + JSON.stringify({ error: 'Something went wrong' }) + '\n\n');
    res.end();
  }
};
