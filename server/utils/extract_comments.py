"""
DOCX Comment Extractor — extracts comments WITH their anchored text from Word documents.
Used by Kira to understand paper discussions before joining meetings.

Usage:
    from extract_comments import extract_docx_comments
    comments = extract_docx_comments("paper.docx")
    for c in comments:
        print(f"[{c['author']}] on \"{c['anchored_text']}\": {c['comment']}")
"""

import zipfile
from xml.etree import ElementTree as ET
from typing import TypedDict


class DocxComment(TypedDict):
    id: str
    author: str
    date: str
    comment: str
    anchored_text: str


NSMAP = {
    'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
}
W = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'


def extract_docx_comments(filepath: str) -> list[DocxComment]:
    """Extract all comments from a DOCX file, linked to their anchored text."""
    
    with zipfile.ZipFile(filepath) as z:
        if 'word/comments.xml' not in z.namelist():
            return []
        
        # Step 1: Parse document body to find anchored text for each comment ID
        doc_xml = z.read('word/document.xml')
        doc_root = ET.fromstring(doc_xml)
        
        active_comments: set[str] = set()
        comment_anchors: dict[str, list[str]] = {}
        
        for p in doc_root.iter(f'{W}p'):
            for child in p:
                tag = child.tag.split('}')[-1]
                
                if tag == 'commentRangeStart':
                    cid = child.get(f'{W}id', '')
                    active_comments.add(cid)
                    if cid not in comment_anchors:
                        comment_anchors[cid] = []
                
                if tag == 'commentRangeEnd':
                    cid = child.get(f'{W}id', '')
                    active_comments.discard(cid)
                
                if tag == 'r':  # text run
                    for t in child.iter(f'{W}t'):
                        if t.text:
                            for cid in active_comments:
                                if cid not in comment_anchors:
                                    comment_anchors[cid] = []
                                comment_anchors[cid].append(t.text)
        
        # Step 2: Parse comments.xml to get comment content + metadata
        comments_xml = z.read('word/comments.xml')
        comments_root = ET.fromstring(comments_xml)
        
        results: list[DocxComment] = []
        
        for comment in comments_root.findall(f'.//w:comment', NSMAP):
            cid = comment.get(f'{W}id', '')
            author = comment.get(f'{W}author', 'Unknown')
            date = comment.get(f'{W}date', '')
            
            texts = [t.text for t in comment.findall(f'.//w:t', NSMAP) if t.text]
            comment_text = ''.join(texts).strip()
            
            anchored = ''.join(comment_anchors.get(cid, [])).strip()
            
            if comment_text:
                results.append({
                    'id': cid,
                    'author': author,
                    'date': date[:10] if date else '',
                    'comment': comment_text,
                    'anchored_text': anchored,
                })
        
        return results


def format_comments_for_context(comments: list[DocxComment]) -> str:
    """Format extracted comments for inclusion in Kira's LLM context."""
    if not comments:
        return "No comments found in the document."
    
    lines = [f"DOCUMENT COMMENTS ({len(comments)} comments from reviewers):\n"]
    
    for c in comments:
        anchor = f' on "{c["anchored_text"][:80]}"' if c['anchored_text'] else ''
        lines.append(f'- [{c["author"]}]{anchor}: "{c["comment"]}"')
    
    return '\n'.join(lines)


if __name__ == '__main__':
    import sys
    import json as json_mod
    
    if len(sys.argv) < 2:
        print("Usage: python extract_comments.py [--json] <file.docx>")
        sys.exit(1)
    
    use_json = '--json' in sys.argv
    filepath = [a for a in sys.argv[1:] if a != '--json'][0]
    
    comments = extract_docx_comments(filepath)
    
    if use_json:
        print(json_mod.dumps(comments))
    else:
        print(format_comments_for_context(comments))
