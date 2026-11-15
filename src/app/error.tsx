'use client';
export default function ErrorPage({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
 return <main lang="en" className="workspace"><h1>This page is currently unavailable</h1><p role="alert">Please reload this page. If a video or payment request is being submitted, check its status and your balance before making a new request.</p><button type="button" className="primary" onClick={retry}>Reload page</button><p><a href="/login">Go to login</a></p></main>;
}
