import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { serveDir } from "https://deno.land/std@0.178.0/http/file_server.ts";

serve(async (req: Request) => {
  return await serveDir(req, { showIndex: true, fsRoot: "./static" });
});
