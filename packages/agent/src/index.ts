import { createServer, IncomingMessage, ServerResponse } from 'node:http';

const PORT = 8080;

function handlePing(_req: IncomingMessage, res: ServerResponse): void {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ status: 'healthy' }));
}

async function handleInvocations(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }
  const body = Buffer.concat(chunks).toString('utf-8');

  // TODO: Wire Strands agent invocation here
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ message: 'Agent invocation placeholder', input: body }));
}

function requestHandler(req: IncomingMessage, res: ServerResponse): void {
  const { method, url } = req;

  if (method === 'GET' && url === '/ping') {
    handlePing(req, res);
  } else if (method === 'POST' && url === '/invocations') {
    handleInvocations(req, res).catch((err) => {
      console.error('Invocation error:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error' }));
    });
  } else {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  }
}

const server = createServer(requestHandler);

server.listen(PORT, () => {
  console.log(`Max Height agent listening on port ${PORT}`);
});
