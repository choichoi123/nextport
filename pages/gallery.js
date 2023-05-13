import React, { useState } from "react";

function BulletinBoard() {
  const [posts, setPosts] = useState([]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const title = e.target.title.value;
    const content = e.target.content.value;
    const newPost = { title, content };
    setPosts([...posts, newPost]);
    e.target.reset();
  };

  return (
    <div className="max-w-md mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">AI가 만들 게시판</h1>

      <form onSubmit={handleSubmit} className="mb-4">
        <input
          type="text"
          name="title"
          placeholder="Title"
          required
          className="w-full border p-2 rounded mb-2"
        />
        <textarea
          name="content"
          placeholder="Content"
          required
          className="w-full border p-2 rounded"
          rows="4"
        ></textarea>
        <button
          type="submit"
          className="bg-blue-500 text-white py-2 px-4 rounded hover:bg-blue-600"
        >
          Add Post
        </button>
      </form>

      {posts.length > 0 ? (
        <ul className="divide-y">
          {posts.map((post, index) => (
            <li key={index} className="py-4">
              <h3 className="text-xl font-bold mb-2">{post.title}</h3>
              <p className="text-gray-700">{post.content}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-gray-500">No posts yet.</p>
      )}
    </div>
  );
}

export default BulletinBoard;
