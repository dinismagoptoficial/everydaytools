import os
import stat

from fastapi import HTTPException
from fastapi.responses import FileResponse

from .storage import local_file


class DownloadResponse(FileResponse):
    def __init__(self, folder, name, filename):
        super().__init__(local_file(folder, name), filename=filename, media_type="application/octet-stream")
        self.folder, self.name = folder, name

    async def __call__(self, scope, receive, send):
        if os.name != "posix":
            return await super().__call__(scope, receive, send)
        descriptor = None
        try:
            directory = os.open(self.folder, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
            try:
                descriptor = os.open(self.name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=directory)
            finally:
                os.close(directory)
            info = os.fstat(descriptor)
            if not stat.S_ISREG(info.st_mode):
                raise OSError("not a regular file")
        except OSError:
            if descriptor is not None:
                os.close(descriptor)
            raise HTTPException(404, "not_found") from None
        try:
            self.path = f"/proc/self/fd/{descriptor}"
            self.stat_result = info
            self.set_stat_headers(info)
            scope = scope | {"extensions": {k: v for k, v in scope.get("extensions", {}).items() if k != "http.response.pathsend"}}
            await super().__call__(scope, receive, send)
        finally:
            os.close(descriptor)
