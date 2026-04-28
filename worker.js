export default {
  async fetch(request) {
    const { searchParams } = new URL(request.url);
    const targetUrl = searchParams.get('url');
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };
    if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
    if (!targetUrl) return new Response("請輸入 URL", { headers: corsHeaders });

    try {
      const response = await fetch(targetUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      const html = await response.text();
      
      // 簡單抓取邏輯
      const title = html.match(/<meta property="og:title" content="(.*?)"/)?.[1] || "未知";
      const artistMatch = html.match(/歌手：(.*?)[。|\s]/);
      const artist = artistMatch ? artistMatch[1] : "未知";
      const lyricsMatch = html.match(/<div class="lyrics">([\s\S]*?)<\/div>/);
      const lyrics = lyricsMatch ? lyricsMatch[1].replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]*>/g, "").trim() : "未找到歌詞";

      return new Response(JSON.stringify({ title, artist, lyrics }), {
        headers: { ...corsHeaders, "Content-Type": "application/json;charset=UTF-8" }
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), { headers: corsHeaders });
    }
  }
};
