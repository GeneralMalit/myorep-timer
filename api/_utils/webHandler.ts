type HeaderValue = string | string[] | number | undefined;

type NodeApiRequest = {
    method?: string;
    url?: string;
    headers?: Record<string, HeaderValue>;
    body?: unknown;
    on?: (event: string, listener: (...args: unknown[]) => void) => void;
};

type NodeApiResponse = {
    statusCode?: number;
    setHeader?: (name: string, value: string) => void;
    end?: (body?: Buffer) => void;
};

type WebHandler = (request: Request) => Promise<Response>;

const readNodeBody = (request: NodeApiRequest): Promise<Buffer | undefined> => {
    if (request.body !== undefined) {
        if (Buffer.isBuffer(request.body)) {
            return Promise.resolve(request.body);
        }

        if (typeof request.body === 'string') {
            return Promise.resolve(Buffer.from(request.body));
        }

        return Promise.resolve(Buffer.from(JSON.stringify(request.body)));
    }

    if (typeof request.on !== 'function') {
        return Promise.resolve(undefined);
    }

    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];

        request.on?.('data', (chunk) => {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
        });
        request.on?.('end', () => {
            resolve(chunks.length > 0 ? Buffer.concat(chunks) : undefined);
        });
        request.on?.('error', reject);
    });
};

const createHeaders = (incomingHeaders: NodeApiRequest['headers']): Headers => {
    const headers = new Headers();

    for (const [name, value] of Object.entries(incomingHeaders ?? {})) {
        if (Array.isArray(value)) {
            for (const item of value) {
                headers.append(name, item);
            }
            continue;
        }

        if (value !== undefined) {
            headers.set(name, String(value));
        }
    }

    return headers;
};

const createRequestUrl = (request: NodeApiRequest, headers: Headers): string => {
    if (request.url?.startsWith('http://') || request.url?.startsWith('https://')) {
        return request.url;
    }

    const host = headers.get('x-forwarded-host') ?? headers.get('host') ?? '127.0.0.1';
    const protocol = headers.get('x-forwarded-proto') ?? 'https';
    return `${protocol}://${host}${request.url ?? '/'}`;
};

const toWebRequest = async (request: Request | NodeApiRequest): Promise<Request> => {
    if (request instanceof Request) {
        return request;
    }

    const method = request.method ?? 'GET';
    const headers = createHeaders(request.headers);
    const body = method === 'GET' || method === 'HEAD'
        ? undefined
        : await readNodeBody(request);

    return new Request(createRequestUrl(request, headers), {
        method,
        headers,
        body,
        duplex: body ? 'half' : undefined,
    } as RequestInit & { duplex?: 'half' });
};

const sendNodeResponse = async (
    nodeResponse: NodeApiResponse,
    webResponse: Response,
): Promise<void> => {
    nodeResponse.statusCode = webResponse.status;

    webResponse.headers.forEach((value, name) => {
        nodeResponse.setHeader?.(name, value);
    });

    nodeResponse.end?.(Buffer.from(await webResponse.arrayBuffer()));
};

export const withWebHandler = (handler: WebHandler) => {
    return async (
        request: Request | NodeApiRequest,
        response?: NodeApiResponse,
    ): Promise<Response | void> => {
        let webResponse: Response;

        try {
            const webRequest = await toWebRequest(request);
            webResponse = await handler(webRequest);
        } catch (error) {
            webResponse = new Response(JSON.stringify({
                error: error instanceof Error ? error.message : 'Could not process API request.',
            }), {
                status: 500,
                headers: {
                    'Content-Type': 'application/json',
                },
            });
        }

        if (!response) {
            return webResponse;
        }

        await sendNodeResponse(response, webResponse);
    };
};
