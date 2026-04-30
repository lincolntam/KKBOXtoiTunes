export default {
  async fetch(request) {
    const { searchParams } = new URL(request.url);
    const targetUrl = searchParams.get('url');

    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
    if (!targetUrl) return new Response("Worker is Ready", { headers: corsHeaders });

    try {
      const response = await fetch(targetUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
      });
      const html = await response.text();

      // 提取資料
      const title = html.match(/<meta property="og:title" content="(.*?)"/)?.[1] || "未知";
      const artistMatch = html.match(/歌手：(.*?)[。|\s]/);
      const artist = artistMatch ? artistMatch[1] : "未知";
      
      // 提取完整歌詞並處理換行
      const lyricsBlock = html.match(/<div class="lyrics">([\s\S]*?)<\/div>/);
      let lyrics = "未找到歌詞";
      if (lyricsBlock) {
        lyrics = lyricsBlock[1]
          .replace(/<br\s*\/?>/gi, "\n")
          .replace(/<[^>]*>/g, "")
          .replace(/&nbsp;/g, " ")
          .trim();
      }

      const composer = html.match(/作曲：(.*?)\s/)?.[1] || "請參考網頁";
      const lyricist = html.match(/作詞：(.*?)\s/)?.[1] || "請參考網頁";

      return new Response(JSON.stringify({ title, artist, composer, lyricist, lyrics }), {
        headers: { ...corsHeaders, "Content-Type": "application/json;charset=UTF-8" }
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), { headers: corsHeaders });
    }
  }
};