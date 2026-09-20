import { Mark, mergeAttributes } from '@tiptap/core';

export interface CommentAttrs {
  id: string;
  text: string;
  author: string;
  resolved: boolean;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    comment: {
      setComment: (attrs: CommentAttrs) => ReturnType;
      unsetComment: () => ReturnType;
      toggleComment: (attrs: CommentAttrs) => ReturnType;
    };
  }
}

export const CommentMark = Mark.create({
  name: 'comment',
  inclusive: false,
  addAttributes() {
    return {
      id: { default: null, parseHTML: (el: HTMLElement) => el.getAttribute('data-comment-id'), renderHTML: (attrs: Record<string, unknown>) => ({ 'data-comment-id': attrs.id }) },
      text: { default: null, parseHTML: (el: HTMLElement) => el.getAttribute('data-comment-text'), renderHTML: (attrs: Record<string, unknown>) => ({ 'data-comment-text': attrs.text }) },
      author: { default: 'You', parseHTML: (el: HTMLElement) => el.getAttribute('data-comment-author'), renderHTML: (attrs: Record<string, unknown>) => ({ 'data-comment-author': attrs.author }) },
      resolved: { default: false, parseHTML: (el: HTMLElement) => el.getAttribute('data-comment-resolved') === 'true', renderHTML: (attrs: Record<string, unknown>) => (attrs.resolved ? { 'data-comment-resolved': 'true' } : {}) },
    };
  },
  parseHTML() {
    return [{ tag: 'span[data-comment]' }];
  },
  renderHTML({ HTMLAttributes }) {
    const resolved = HTMLAttributes['data-comment-resolved'] === 'true';
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-comment': 'true',
        style: resolved
          ? 'background: rgba(148,163,184,0.2); text-decoration: line-through;'
          : 'background: rgba(250,204,21,0.35); border-bottom: 2px solid rgb(234,179,8);',
        title: (HTMLAttributes['data-comment-text'] as string) || 'Comment',
      }),
      0,
    ];
  },
  addCommands() {
    return {
      setComment:
        (attrs) =>
        ({ chain }) =>
          chain().setMark(this.name, attrs).run(),
      unsetComment:
        () =>
        ({ chain }) =>
          chain().unsetMark(this.name).run(),
      toggleComment:
        (attrs) =>
        ({ chain }) =>
          chain().toggleMark(this.name, attrs).run(),
    };
  },
});
