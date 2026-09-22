namespace BDoc.Domain.Entities;

public class DocumentShare
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid DocumentId { get; set; }
    public Guid SharedWithUserId { get; set; }

    /// <summary>"viewer" (read/export) or "editor" (read + update/restore).</summary>
    public string Permission { get; set; } = "viewer";
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
