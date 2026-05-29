import { Router } from "express";
import { getTodos, patchTodo, postTodo } from "../controllers/todo.controller";

export const todoRouter = Router();

todoRouter.get("/", getTodos);
todoRouter.post("/", postTodo);
todoRouter.patch("/:id", patchTodo);

