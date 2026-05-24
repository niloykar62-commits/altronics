<div className="flex gap-6 pt-3 border-t border-gray-100">
  <div className="text-center">
    <p className="text-xl font-bold">{posts.length}</p>
    <p className="text-xs text-gray-400">Posts</p>
  </div>
  <div className="text-center">
    <p className="text-xl font-bold">{profile?.followers?.length || 0}</p>
    <p className="text-xs text-gray-400">Followers</p>
  </div>
  <div className="text-center">
    <p className="text-xl font-bold">{profile?.following?.length || 0}</p>
    <p className="text-xs text-gray-400">Following</p>
  </div>
</div>