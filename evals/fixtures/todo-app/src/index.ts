import { createTodoService } from "./todo-service.js";

const service = createTodoService();
service.addTodo("Buy milk");
service.addTodo("Write tests");
service.addTodo("Ship feature");

console.log(service.summary());
console.log(service.listTodos().map((todo) => todo.title).join(", "));
