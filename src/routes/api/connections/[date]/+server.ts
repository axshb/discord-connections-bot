import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit'; 

export const GET: RequestHandler = async ({ params }) => {
    const date = params.date; 
    const url = `https://www.nytimes.com/svc/connections/v2/${date}.json`;
    
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error('NYT fetch failed');
        const data = await response.json();
        return json(data);
    } catch (e) {
        return json({ error: "Failed to fetch NYT data" }, { status: 500 });
    }
};