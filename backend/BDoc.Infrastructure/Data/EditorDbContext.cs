using BDoc.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace BDoc.Infrastructure.Data;

public class EditorDbContext : DbContext
{
    public EditorDbContext(DbContextOptions<EditorDbContext> options) : base(options) { }

    public DbSet<Document> Documents => Set<Document>();
}