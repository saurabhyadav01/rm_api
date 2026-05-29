import { randomUUID } from "crypto";
import { type Todo } from "../models/todo.model";

const todos: Todo[] = [
  {
    id: "seed-1",
    title: "Wire RM backend",
    done: false,
    createdAt: new Date().toISOString(),
  },
];

export function listTodos(): Todo[] {
  return [...todos];
}

export function createTodo(title: string): Todo {
  const todo: Todo = {
    id: randomUUID(),
    title,
    done: false,
    createdAt: new Date().toISOString(),
  };
  todos.unshift(todo);
  return todo;
}

export function setTodoDone(id: string, done: boolean): Todo | null {
  const todo = todos.find((t) => t.id === id);
  if (!todo) return null;
  todo.done = done;
  return todo;
}

