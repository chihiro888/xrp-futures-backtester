import { createClient } from '@/utils/supabase/server';

export default async function Home() {
  const supabase = await createClient();
  // Try to fetch something to check connection, or just check if client initializes
  // Without tables, we can't really fetch much, but we can check if the client is created.

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24 bg-gray-900 text-white">
      <div className="z-10 max-w-5xl w-full items-center justify-between font-mono text-sm lg:flex">
        <h1 className="text-4xl font-bold mb-8">XRP Futures Backtester</h1>
      </div>

      <div className="relative flex place-items-center">
        <div className="flex flex-col gap-4 items-center">
          <p className="text-xl">Supabase Integration Status</p>
          <div className="p-4 bg-gray-800 rounded-lg border border-gray-700">
            {supabase ? (
              <span className="text-green-400">Client Initialized</span>
            ) : (
              <span className="text-red-400">Initialization Failed</span>
            )}
          </div>
          <p className="text-sm text-gray-400 mt-4">
            Check console for connection errors if any.
          </p>
        </div>
      </div>
    </main>
  );
}
