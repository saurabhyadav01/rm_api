import { type Request, type Response } from "express";
import { z } from "zod";
import { createTodo, listTodos, setTodoDone } from "../services/todo.service";

export function getTodos(_req: Request, res: Response) {
  res.json({ items: listTodos() });
}

const createTodoSchema = z.object({
  title: z.string().min(1).max(200),
});

export function postTodo(req: Request, res: Response) {
  const parsed = createTodoSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
  }
  const todo = createTodo(parsed.data.title);
  return res.status(201).json({ item: todo });
}

const patchTodoSchema = z.object({
  done: z.boolean(),
});

export function patchTodo(req: Request, res: Response) {
  const parsed = patchTodoSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
  }
  const id = String(req.params.id ?? "");
  const updated = setTodoDone(id, parsed.data.done);
  if (!updated) return res.status(404).json({ error: "Todo not found" });
  return res.json({ item: updated });
}

