export default {
  async fetch(request, env, ctx) {
    const { searchParams } = new URL(request.url);
    const targetUrl = searchParams.get('url');

    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
      "Access-Control-Allow-Headers": {
        "Content-Type": "application/json;charset=UTF-8"
      },
    };

    if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

    if (!targetUrl) {
      return new Response(JSON.stringify({ error: "請輸入 URL" }), {
        status: 400,
        headers: corsHeaders
      });
    }

    try {
      // 模擬更真實的瀏覽器頭部，防止被 KKBOX 拒絕
      const response = await fetch(targetUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        }
      });

      if (!response.ok) throw new Error("KKBOX 網頁讀取失敗");

      const html = await response.text();

      // 使用更安全的提取方式
      const title = html.match(/<meta property="og:title" content="(.*?)"/)?.[1] || "未知歌名";
      
      // 提取歌手 (優化版 Regex)
      const artistMatch = html.match(/歌手：(.*?)[。|\s]/);
      const artist = artistMatch ? artistMatch[1] : "未知歌手";

      // 提取歌詞 (修正了部分歌曲可能找不到的情況)
      const lyricsMatch = html.match(/<div class="lyrics">([\s\S]*?)<\/div>/);
      let lyrics = "未能抓取完整歌詞";
      if (lyricsMatch) {
        lyrics = lyricsMatch[1]
          .replace(/<br\s*\/?>/gi, "\n")
          .replace(/<[^>]*>/g, "")
          .trim();
      }

      // 提取作曲作詞
      const composer = html.match(/作曲：(.*?)\s/)?.[1] || "請參考網頁";
      const lyricist = html.match(/作詞：(.*?)\s/)?.[1] || "請參考網頁";

      return new Response(JSON.stringify({
        title,
        artist,
        composer,
        lyricist,
        lyrics
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json;charset=UTF-8" }
      });

    } catch (e) {
      // 回傳錯誤訊息幫助除錯
      return new Response(JSON.stringify({ error: e.message }), {
        status: 500,
        headers: corsHeaders
      });
    }
  }
};
