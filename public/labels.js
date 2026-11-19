export const platformName=id=>({x:'X',bilibili:'哔哩哔哩',xiaohongshu:'小红书'}[id]||id);
export const scopeLabel=id=>({'feed-summary-only':'仅订阅摘要（正文未能获取）','article-extract':'网页文章正文提取','document-diff':'官方文档变更摘录','visible-post-text':'X 可见推文文字','dynamic-text-and-video-caption':'B站动态 / 视频文案，未转写视频','visible-note-text':'小红书可见笔记正文','listing-page-rejected':'已排除的分类页'}[id]||'提供的文字材料');
