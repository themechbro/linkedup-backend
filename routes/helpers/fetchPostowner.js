const pool = require("../../db");

const fetchPostOwner = async (post_id) => {
  const response = await pool.query(`SELECT owner from posts where id=$1`, [
    post_id,
  ]);
  return response.rows[0]?.owner || null;
};

module.exports = fetchPostOwner;
