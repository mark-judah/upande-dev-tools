import { call } from '@/core/api/call';

export type Comment = {
  name: string;
  content: string;
  comment_by: string;
  full_name?: string | null;
  creation: string;
};

export const getComments = (doctype: string, name: string) =>
  call<Comment[]>('comments.get_comments', { doctype, name }, true);

export const addComment = (doctype: string, name: string, text: string) =>
  call<unknown>('comments.add_comment', { doctype, name, text });
