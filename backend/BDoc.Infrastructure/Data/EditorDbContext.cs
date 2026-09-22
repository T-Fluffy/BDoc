using BDoc.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace BDoc.Infrastructure.Data;

public class EditorDbContext : DbContext
{
    public EditorDbContext(DbContextOptions<EditorDbContext> options) : base(options) { }

    public DbSet<Document> Documents => Set<Document>();
    public DbSet<DocumentVersion> DocumentVersions => Set<DocumentVersion>();
    public DbSet<User> Users => Set<User>();
    public DbSet<DocumentShare> DocumentShares => Set<DocumentShare>();
    public DbSet<DocumentSuggestion> DocumentSuggestions => Set<DocumentSuggestion>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        // One share row per (document, user).
        modelBuilder.Entity<DocumentShare>()
            .HasIndex(s => new { s.DocumentId, s.SharedWithUserId })
            .IsUnique();
    }
}