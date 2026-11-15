'use client';
export default function GlobalError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
 return <html lang="en"><body><main><h1>This page is currently unavailable</h1><p role="alert">Please reload this page. Check the request status and your balance before generating a video or paying again.</p><button type="button" onClick={retry}>Reload page</button><p><a href="/login">Go to login</a></p></main></body></html>;
}
