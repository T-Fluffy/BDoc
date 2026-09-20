namespace BDoc.Domain.Entities;

public class DocumentVersion
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid DocumentId { get; set; }
    public string Title { get; set; } = string.Empty;
    public string Content { get; set; } = string.Empty;
    public string? Settings { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
